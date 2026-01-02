from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("APP_SECRET_KEY", "dev-secret")

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading') 

# --- ESTADO DO SERVIDOR ---
router_user = None
connected_users = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CIFRAS_DB_PATH = os.path.join(BASE_DIR, "cifras.db")
USUARIOS_DB_PATH = os.path.join(BASE_DIR, "usuarios.db")

def get_cifras_conn():
    conn = sqlite3.connect(CIFRAS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_usuarios_conn():
    conn = sqlite3.connect(USUARIOS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_dbs():
    conn = get_cifras_conn()
    conn.execute("CREATE TABLE IF NOT EXISTS cifras (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, banda TEXT NOT NULL, tom TEXT NOT NULL, letra TEXT NOT NULL, cifra TEXT NOT NULL, created_at TEXT NOT NULL)")
    conn.close()
    
    conn = get_usuarios_conn()
    # NOVA ESTRUTURA: nome_completo, login, email
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nome_completo TEXT NOT NULL,
            login TEXT NOT NULL UNIQUE, 
            email TEXT NOT NULL,
            senha TEXT NOT NULL, 
            nivel TEXT NOT NULL, 
            status TEXT NOT NULL DEFAULT 'ativo'
        )
    """)
    conn.close()

# ===================== ROTAS WEB GERAIS =====================

@app.route("/")
def home():
    return redirect(url_for("listar_cifras"))

@app.route("/cifras")
def listar_cifras():
    conn = get_cifras_conn()
    q = request.args.get("q", "").strip()
    if q:
        musicas = conn.execute("SELECT * FROM cifras WHERE titulo LIKE ? OR banda LIKE ? ORDER BY created_at DESC", (f"%{q}%", f"%{q}%")).fetchall()
    else:
        musicas = conn.execute("SELECT * FROM cifras ORDER BY created_at DESC").fetchall()
    conn.close()
    return render_template("index.html", musicas=musicas, q=q)

@app.route("/cifras/nova", methods=["GET", "POST"])
def criar_cifra():
    if request.method == "POST":
        data = [request.form.get("titulo"), request.form.get("banda"), request.form.get("tom"), request.form.get("letra"), request.form.get("cifra"), datetime.now().isoformat()]
        conn = get_cifras_conn()
        conn.execute("INSERT INTO cifras (titulo, banda, tom, letra, cifra, created_at) VALUES (?, ?, ?, ?, ?, ?)", data)
        conn.commit(); conn.close()
        flash("Cifra cadastrada!", "success")
        return redirect(url_for("listar_cifras"))
    return render_template("create_edit.html", mode="create", values={})

@app.route("/cifras/<int:cifra_id>")
def detalhar_cifra(cifra_id):
    conn = get_cifras_conn()
    row = conn.execute("SELECT * FROM cifras WHERE id = ?", (cifra_id,)).fetchone()
    conn.close()
    return render_template("detail.html", m=row)

@app.route("/cifras/<int:cifra_id>/editar", methods=["GET", "POST"])
def editar_cifra(cifra_id):
    conn = get_cifras_conn()
    if request.method == "POST":
        data = [request.form.get("titulo"), request.form.get("banda"), request.form.get("tom"), request.form.get("letra"), request.form.get("cifra"), cifra_id]
        conn.execute("UPDATE cifras SET titulo=?, banda=?, tom=?, letra=?, cifra=? WHERE id=?", data)
        conn.commit(); conn.close()
        flash("Cifra atualizada!", "success"); return redirect(url_for("detalhar_cifra", cifra_id=cifra_id))
    row = conn.execute("SELECT * FROM cifras WHERE id = ?", (cifra_id,)).fetchone()
    conn.close(); return render_template("create_edit.html", mode="edit", values=row)

@app.route("/cifras/<int:cifra_id>/excluir", methods=["POST"])
def excluir_cifra(cifra_id):
    conn = get_cifras_conn()
    conn.execute("DELETE FROM cifras WHERE id = ?", (cifra_id,))
    conn.commit(); conn.close()
    flash("Cifra excluída.", "info"); return redirect(url_for("listar_cifras"))

# ===================== ROTAS ADMIN =====================

@app.route("/admin/usuarios")
def gerenciar_usuarios():
    conn = get_usuarios_conn()
    # Ajustado para exibir o login e nome_completo
    usuarios = conn.execute("SELECT * FROM usuarios ORDER BY nome_completo").fetchall()
    conn.close(); return render_template("admin_usuarios.html", usuarios=usuarios)

@app.route("/admin/conectados")
def usuarios_conectados():
    return render_template("usuarios_conectados.html", users=connected_users, router_user=router_user)

@app.route("/admin/usuarios/novo", methods=["POST"])
def criar_usuario():
    nome_completo = request.form.get("nome_completo")
    login = request.form.get("login")
    email = request.form.get("email")
    senha = request.form.get("senha")
    nivel = request.form.get("nivel")
    
    hash_s = generate_password_hash(senha)
    conn = get_usuarios_conn()
    try:
        conn.execute("""
            INSERT INTO usuarios (nome_completo, login, email, senha, nivel) 
            VALUES (?, ?, ?, ?, ?)
        """, (nome_completo, login, email, hash_s, nivel))
        conn.commit()
        flash("Usuário criado com sucesso!", "success")
    except:
        flash("Erro: O Login informado já existe.", "danger")
    conn.close()
    return redirect(url_for("gerenciar_usuarios"))

@app.route("/admin/usuarios/<int:user_id>/status", methods=["POST"])
def alternar_status_usuario(user_id):
    conn = get_usuarios_conn()
    user = conn.execute("SELECT status FROM usuarios WHERE id=?", (user_id,)).fetchone()
    if user:
        novo = "inativo" if user['status'] == 'ativo' else "ativo"
        conn.execute("UPDATE usuarios SET status=? WHERE id=?", (novo, user_id))
        conn.commit()
    conn.close(); return redirect(url_for("gerenciar_usuarios"))

@app.route("/admin/usuarios/<int:user_id>/excluir", methods=["POST"])
def excluir_usuario(user_id):
    conn = get_usuarios_conn()
    conn.execute("DELETE FROM usuarios WHERE id = ?", (user_id,))
    conn.commit(); conn.close(); return redirect(url_for("gerenciar_usuarios"))

# ===================== API JSON E SOCKETS =====================

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    # Acesso via campo 'login'
    row = get_usuarios_conn().execute("SELECT * FROM usuarios WHERE login=?", (data.get("username"),)).fetchone()
    if row and check_password_hash(row["senha"], data.get("password")):
        if row["status"] == 'inativo': return jsonify({"status": "error", "message": "Inativo"}), 403
        return jsonify({"status": "success", "nivel": row["nivel"]})
    return jsonify({"status": "error", "message": "Erro"}), 401

@app.route("/api/songs")
def api_songs():
    rows = get_cifras_conn().execute("SELECT * FROM cifras ORDER BY titulo").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/song/<int:cifra_id>")
def api_song(cifra_id):
    row = get_cifras_conn().execute("SELECT * FROM cifras WHERE id=?", (cifra_id,)).fetchone()
    return jsonify(dict(row)) if row else (jsonify({"error": "404"}), 404)

@socketio.on('connect')
def handle_connect():
    connected_users[request.sid] = {'user_info': 'Anônimo', 'logs': []}
    emit('router_claimed', {'router_user': router_user})

@socketio.on('identify')
def handle_identify(data):
    if request.sid in connected_users: connected_users[request.sid]['user_info'] = data.get('username')

@socketio.on('claim_router')
def handle_claim_router(data):
    global router_user; router_user = data.get('user')
    emit('router_claimed', {'router_user': router_user}, broadcast=True)

@socketio.on('open_song')
def handle_open_song(data):
    emit('open_song', {'song_id': data.get('song_id')}, broadcast=True, include_self=False)

if __name__ == "__main__":
    init_dbs()
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)