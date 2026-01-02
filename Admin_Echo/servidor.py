# unified_server.py
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import sqlite3, os
from datetime import datetime

# Configuração básica
app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("APP_SECRET_KEY", "dev-secret")

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

DB_PATH = os.path.join(os.path.dirname(__file__), "cifras.db")

# Estado em memória (perde ao reiniciar)
state = {
    "router_sid": None,
    "router_user": None
}

# ---------------------------
# Funções auxiliares
# ---------------------------
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    if not os.path.exists(DB_PATH):
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cifras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                banda TEXT NOT NULL,
                tom TEXT NOT NULL,
                letra TEXT NOT NULL,
                cifra TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()

# ---------------------------
# Rotas ADMIN WEB (HTML)
# ---------------------------
@app.route("/")
def home():
    return redirect(url_for("listar_cifras"))

@app.route("/cifras")
def listar_cifras():
    q = request.args.get("q", "").strip()
    conn = get_conn()
    cur = conn.cursor()
    if q:
        cur.execute("""
            SELECT id, titulo, banda, tom, created_at
            FROM cifras
            WHERE titulo LIKE ? OR banda LIKE ? OR tom LIKE ?
            ORDER BY created_at DESC
        """, (f"%{q}%", f"%{q}%", f"%{q}%"))
    else:
        cur.execute("""
            SELECT id, titulo, banda, tom, created_at
            FROM cifras
            ORDER BY created_at DESC
        """)
    rows = cur.fetchall()
    conn.close()
    return render_template("index.html", musicas=rows, q=q)

@app.route("/cifras/nova", methods=["GET", "POST"])
def criar_cifra():
    if request.method == "POST":
        data = {
            "titulo": request.form.get("titulo", "").strip(),
            "banda": request.form.get("banda", "").strip(),
            "tom": request.form.get("tom", "").strip(),
            "letra": request.form.get("letra", "").strip(),
            "cifra": request.form.get("cifra", "").strip(),
        }
        if not all(data.values()):
            flash("Preencha todos os campos.", "danger")
            return render_template("create_edit.html", mode="create", values=data)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cifras (titulo, banda, tom, letra, cifra, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (data["titulo"], data["banda"], data["tom"], data["letra"], data["cifra"],
              datetime.now().isoformat(timespec="seconds")))
        conn.commit()
        conn.close()
        flash("Cifra cadastrada com sucesso!", "success")
        return redirect(url_for("listar_cifras"))
    return render_template("create_edit.html", mode="create", values={})

@app.route("/cifras/<int:cifra_id>")
def detalhar_cifra(cifra_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cifras WHERE id = ?", (cifra_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        flash("Registro não encontrado.", "warning")
        return redirect(url_for("listar_cifras"))
    return render_template("detail.html", m=row)

@app.route("/cifras/<int:cifra_id>/editar", methods=["GET", "POST"])
def editar_cifra(cifra_id):
    conn = get_conn()
    cur = conn.cursor()
    if request.method == "POST":
        data = {
            "titulo": request.form.get("titulo", "").strip(),
            "banda": request.form.get("banda", "").strip(),
            "tom": request.form.get("tom", "").strip(),
            "letra": request.form.get("letra", "").strip(),
            "cifra": request.form.get("cifra", "").strip(),
        }
        if not all(data.values()):
            flash("Preencha todos os campos.", "danger")
            data["id"] = cifra_id
            conn.close()
            return render_template("create_edit.html", mode="edit", values=data)
        cur.execute("""
            UPDATE cifras
               SET titulo = ?, banda = ?, tom = ?, letra = ?, cifra = ?
             WHERE id = ?
        """, (data["titulo"], data["banda"], data["tom"], data["letra"], data["cifra"], cifra_id))
        conn.commit()
        conn.close()
        flash("Cifra atualizada!", "success")
        return redirect(url_for("detalhar_cifra", cifra_id=cifra_id))
    cur.execute("SELECT * FROM cifras WHERE id = ?", (cifra_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        flash("Registro não encontrado.", "warning")
        return redirect(url_for("listar_cifras"))
    return render_template("create_edit.html", mode="edit", values=row)

@app.route("/cifras/<int:cifra_id>/excluir", methods=["POST"])
def excluir_cifra(cifra_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM cifras WHERE id = ?", (cifra_id,))
    conn.commit()
    conn.close()
    flash("Cifra excluída.", "info")
    return redirect(url_for("listar_cifras"))

# ---------------------------
# Rotas API (Android)
# ---------------------------
@app.route("/api/songs", methods=["GET"])
def list_songs():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, titulo FROM cifras ORDER BY titulo")
    rows = cur.fetchall()
    conn.close()
    return jsonify([{"id": r["id"], "titulo": r["titulo"]} for r in rows])

@app.route("/api/song/<int:song_id>", methods=["GET"])
def get_song(song_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, titulo, cifra, letra FROM cifras WHERE id = ?", (song_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "id": row["id"],
        "titulo": row["titulo"],
        "cifra": row["cifra"],
        "letra": row["letra"]
    })

# ---------------------------
# Eventos WebSocket (Router)
# ---------------------------
@socketio.on("connect")
def handle_connect():
    sid = request.sid
    print(f"[SOCKET] connect {sid}")
    if state["router_sid"]:
        emit("router_claimed", {"router_user": state["router_user"]}, room=sid)

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    print(f"[SOCKET] disconnect {sid}")
    if state["router_sid"] == sid:
        print("[SOCKET] router disconnected")
        state["router_sid"] = None
        state["router_user"] = None
        socketio.emit("router_cleared", {})

@socketio.on("claim_router")
def on_claim_router(data):
    user = data.get("user", "unknown")
    state["router_sid"] = request.sid
    state["router_user"] = user
    print(f"[SOCKET] {user} claimed router")
    socketio.emit("router_claimed", {"router_user": user})

@socketio.on("release_router")
def on_release_router(data):
    if state["router_sid"] == request.sid:
        state["router_sid"] = None
        state["router_user"] = None
        socketio.emit("router_cleared", {})
        print("[SOCKET] router released")

@socketio.on("open_song")
def on_open_song(data):
    song_id = data.get("song_id")
    user = data.get("user", "unknown")
    print(f"[SOCKET] open_song from {user} => song_id {song_id}")
    socketio.emit("open_song", {"song_id": song_id, "user": user})

# ---------------------------
# Inicialização
# ---------------------------
if __name__ == "__main__":
    init_db()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
