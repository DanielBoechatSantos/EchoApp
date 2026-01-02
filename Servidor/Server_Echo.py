# Echo App Server
import os
import subprocess
import sys
import tkinter as tk
from tkinter import ttk, messagebox
import socket # <--- Adicionado para capturar o IP local
import re # <--- Adicionado para verificar o IP local

# ========= CONFIGURAÇÃO: AJUSTE AQUI =========
PATH_FLASK = r'D:\\Desenvolvimento\\Projeto_Echo\\Admin_Echo\\app.py'
PYTHON_EXE = sys.executable 

# Definições do Servidor
SERVER_PORT = "5000"
SERVER_PROTOCOL = "HTTPS" # Protocolo fixo
# ============================================

IS_WINDOWS = os.name == "nt"

# CORREÇÃO DO ERRO DE SINTAXE: removendo os caracteres não imprimíveis
if IS_WINDOWS:
    CREATE_NEW_PROCESS_GROUP = 0x00000200
else:
    CREATE_NEW_PROCESS_GROUP = 0

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Echo - Gerenciador de Servidores")
        self.geometry("400x300")
        self.minsize(820, 350)

        # --- NOVO: Captura o IP local dinamicamente ---
        self.local_ip = self._get_local_ip()
        # ---------------------------------------------
        
        # Paleta suave
        self.bg = "#0f172a"
        self.card_bg = "#111827" # card
        self.text = "#e5e7eb"
        self.accent = "#1f6feb"
        self.ok = "#16a34a"
        self.err = "#dc2626"
        self.dim = "#9ca3af"

        self.configure(bg=self.bg)
        self._style()

        # Processos
        self.proc_flask = None
        self.proc_expo = None

        # UI
        self._build_ui()

        # Loop de status
        self.after(500, self._update_status_loop)

        # Fechar app encerra tudo
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    # --- NOVO: Função para obter o IP de rede local ---
    def _get_local_ip(self):
        # Tenta conectar a um servidor externo (não envia dados) apenas para 
        # descobrir qual interface de rede está sendo usada, retornando o IP local.
        try:
            # Tenta se conectar temporariamente ao Google DNS (8.8.8.8) na porta 80
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80)) 
            ip = s.getsockname()[0]
            s.close()
            # Valida se é um endereço IPv4 válido antes de retornar
            if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
                return ip
            return "IP Indefinido"
        except Exception:
            return "127.0.0.1 (Sem conexão)" # Retorna localhost se não conseguir
    # ----------------------------------------------------

    def _style(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background=self.bg)
        style.configure("Card.TFrame", background=self.card_bg, borderwidth=0)
        style.configure("Title.TLabel", background=self.bg, foreground=self.text, font=("Segoe UI", 18, "bold"))
        style.configure("Sub.TLabel", background=self.card_bg, foreground=self.dim, font=("Segoe UI", 10))
        style.configure("Big.TLabel", background=self.card_bg, foreground=self.text, font=("Segoe UI", 12, "bold"))
        style.configure("Status.TLabel", background=self.card_bg, foreground=self.text, font=("Segoe UI", 11, "bold"))
        style.configure("TButton", font=("Segoe UI", 11, "bold"), padding=10)

    def _build_ui(self):
        header = ttk.Frame(self)
        header.pack(fill="x", padx=20, pady=(18, 10))
        ttk.Label(header, text="Painel de Servidores (Ambiente em teste)", style="Title.TLabel").pack(side="left")

        grid = ttk.Frame(self)
        grid.pack(fill="both", expand=True, padx=20, pady=10)

        grid.columnconfigure(0, weight=1, uniform="card")
        grid.columnconfigure(1, weight=1, uniform="card")

        # --- Card Flask (Servidor App) ---
        # Usa IP dinâmico capturado no __init__
        server_address = f"{SERVER_PROTOCOL}://{self.local_ip}:{SERVER_PORT}" 
        
        self.card_flask = self._make_card(
            grid,
            title="Servidor de Aplicação",
            subtitle=os.path.normpath("Inicia o ambiente no Windows com a lista de músicas e acesso ao Servidor de Armazenamento dos Dados."),
            btn_text="▶️  Iniciar Servidor Windows",
            btn_cmd=self.start_flask,
            col=0,
            address=server_address # Passa o endereço dinâmico para o card
        )
        # Status label específico do card flask
        self.lbl_status_flask = self.card_flask["status_label"]

        # Card Encerrar
        self.card_kill = self._make_card(
            grid,
            title="Encerrar",
            subtitle="Finaliza todos os servidores",
            btn_text="🛑  Encerrar Servidores",
            btn_cmd=self.stop_all,
            col=1,
            show_status=False
        )

        # Rodapé
        footer = ttk.Frame(self)
        footer.pack(fill="x", padx=20, pady=(6, 16))
        ttk.Label(
            footer,
            text="Dica: inicie cada serviço separadamente. O status atualiza sozinho.",
            style="Title.TLabel",
            font=("Segoe UI", 10)
        ).pack(side="left")

    def _make_card(self, parent, title, subtitle, btn_text, btn_cmd, col, show_status=True, address=None):
        outer = ttk.Frame(parent, style="TFrame")
        outer.grid(row=0, column=col, sticky="nsew", padx=8, pady=8)

        card = ttk.Frame(outer, style="Card.TFrame")
        card.pack(fill="both", expand=True)
        container = tk.Frame(card, bg=self.card_bg, bd=0, highlightthickness=0)
        container.pack(fill="both", expand=True, padx=14, pady=14)

        ttk.Label(container, text=title, style="Big.TLabel").pack(anchor="w", pady=(0, 1))
        ttk.Label(container, text=subtitle, style="Sub.TLabel", wraplength=260, justify="left").pack(anchor="w", pady=(0, 12))

        # --- LABEL PARA EXIBIR O ENDEREÇO IP/PORTA (AGORA DINÂMICO) ---
        if address:
            tk.Label(
                container,
                text=f"Endereço: {address}",
                bg=self.card_bg,
                fg=self.text,
                font=("Segoe UI", 11, "bold")
            ).pack(anchor="w", pady=(0, 10))
        # ----------------------------------------------------

        status_label = None
        if show_status:
            status_label = tk.Label(
                container,
                text="🔴 OFFLINE",
                bg=self.card_bg,
                fg=self.err,
                font=("Segoe UI", 11, "bold")
            )
            status_label.pack(anchor="w", pady=(0, 10))

        btn = ttk.Button(container, text=btn_text, command=btn_cmd)
        btn.pack(anchor="w")

        return {
            "frame": outer,
            "status_label": status_label,
            "button": btn
        }

    # ---------- Controle de processos ----------
    def start_flask(self):
        if self._is_running(self.proc_flask):
            messagebox.showinfo("Servidor", "O servidor Flask já está em execução.")
            return
        if not os.path.isfile(PATH_FLASK):
            messagebox.showerror("Caminho inválido", f"Arquivo não encontrado:\n{PATH_FLASK}")
            return
        try:
            self.proc_flask = subprocess.Popen(
                [PYTHON_EXE, PATH_FLASK],
                cwd=os.path.dirname(PATH_FLASK) or None,
                creationflags=CREATE_NEW_PROCESS_GROUP,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        except Exception as e:
            messagebox.showerror("Erro", f"Falha ao iniciar Flask:\n{e}")

    def stop_all(self):
        errors = []

        def kill_proc(p, name):
            if not self._is_running(p):
                return
            try:
                if IS_WINDOWS:
                    # Mata árvore de processos
                    subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True)
                else:
                    p.terminate()
            except Exception as e:
                errors.append(f"{name}: {e}")

        kill_proc(self.proc_expo, "Expo")
        kill_proc(self.proc_flask, "Flask")
        self.proc_expo = None
        self.proc_flask = None

        if errors:
            messagebox.showwarning("Aviso", "Alguns processos podem não ter sido encerrados:\n" + "\n".join(errors))

    def _is_running(self, proc):
        return proc is not None and proc.poll() is None

    def _update_status_loop(self):
        # Atualiza status Flask
        if self.lbl_status_flask is not None:
            if self._is_running(self.proc_flask):
                self._set_status(self.lbl_status_flask, online=True)
            else:
                self._set_status(self.lbl_status_flask, online=False)

        # Mantive a verificação de self.lbl_status_expo para o caso de você
        # querer adicionar o card do Expo depois.
        if hasattr(self, 'lbl_status_expo') and self.lbl_status_expo is not None:
            if self._is_running(self.proc_expo):
                self._set_status(self.lbl_status_expo, online=True)
            else:
                self._set_status(self.lbl_status_expo, online=False)

        self.after(500, self._update_status_loop)

    def _set_status(self, label: tk.Label, online: bool):
        if online:
            label.config(text="🟢 ONLINE", fg=self.ok, bg=self.card_bg)
        else:
            label.config(text="🔴 OFFLINE", fg=self.err, bg=self.card_bg)

    def on_close(self):
        if messagebox.askyesno("Sair", "O ambiente será encerrado e não será possível mais acessar o App e no Windows. Deseja continuar?"):
            try:
                self.stop_all()
            finally:
                self.destroy()


if __name__ == "__main__":
    # Apenas para garantir que a constante está definida corretamente se for Windows
    if IS_WINDOWS and not PATH_FLASK.startswith(r'\\'):
        # Se o caminho não for UNC, garantimos que o Python o encontre
        PATH_FLASK = os.path.normpath(PATH_FLASK)
        
    # Verifica se a label de status do Expo foi inicializada
    # (foi removida do _build_ui, então a definimos aqui para evitar um AttributeError)
    App.lbl_status_expo = None

    app = App()
    app.mainloop()