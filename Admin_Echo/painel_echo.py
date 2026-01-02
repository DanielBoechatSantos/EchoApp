import sys
import subprocess
import pyperclip
from pyngrok import ngrok
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QLabel, QPushButton, QMessageBox
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QPixmap
import qrcode
from io import BytesIO 
import os
import time

class ModernSwitch(QPushButton):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setMinimumSize(60, 30)

    def paintEvent(self, event):
        from PyQt5.QtGui import QPainter, QColor, QBrush
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        bg_color = QColor("#4CAF50") if self.isChecked() else QColor("#F44336")
        painter.setBrush(QBrush(bg_color))
        painter.setPen(Qt.NoPen)
        painter.drawRoundedRect(0, 0, self.width(), self.height(), 15, 15)
        painter.setBrush(QBrush(QColor("white")))
        x_pos = self.width() - 26 if self.isChecked() else 4
        painter.drawEllipse(x_pos, 4, 22, 22)

class EchoThread(QThread):
    ngrok_started = pyqtSignal(str)
    error_occurred = pyqtSignal(str)

    def __init__(self, port, server_path):
        super().__init__()
        self.port = port
        self.server_path = server_path
        self.server_process = None

    def run(self):
        try:
            # 1. Limpa instâncias antigas
            ngrok.kill()
            
            # 2. Inicia Túnel Ngrok
            public_url = ngrok.connect(self.port).public_url
            pyperclip.copy(public_url)
            
            # 3. Define o diretório de trabalho (onde o app.py mora)
            cwd = os.path.dirname(os.path.abspath(self.server_path))

            # 4. Define o executável Python (Usa o do sistema se for executável compilado)
            python_exe = "python3" if getattr(sys, 'frozen', False) else sys.executable
            python_exe = "/home/daniel/.pyenv/versions/3.12.3/bin/python"

            # 5. Inicia o Flask com output não-bufferizado (-u) para capturar erros
            self.server_process = subprocess.Popen(
                [python_exe, "-u", self.server_path],
                cwd=cwd, 
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=os.environ.copy()
            )
            
            # Pequena espera para verificar se o servidor não "crashou" no login
            time.sleep(1.5)
            
            if self.server_process.poll() is None:
                self.ngrok_started.emit(public_url)
            else:
                _, err = self.server_process.communicate()
                self.error_occurred.emit(f"Flask falhou ao iniciar:\n{err}")

        except Exception as e:
            self.error_occurred.emit(str(e))

    def stop(self):
        if self.server_process:
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=2)
            except:
                self.server_process.kill()
        ngrok.kill()

class EchoControlPanel(QWidget):
    def __init__(self):
        super().__init__()
        self.echo_thread = None
        self.initUI()

    def initUI(self):
        self.setWindowTitle('Servidor Echo Cifras')
        self.setFixedSize(450, 650)
        self.setStyleSheet("background-color: #0d1b2a; color: white;")
        
        layout = QVBoxLayout()
        layout.setAlignment(Qt.AlignCenter)
        layout.setSpacing(15)

        self.label_status = QLabel("Status: DESLIGADO")
        self.label_status.setFont(QFont('Arial', 14, QFont.Bold))
        self.label_status.setStyleSheet("color: #F44336;")
        
        self.switch = ModernSwitch()
        self.switch.clicked.connect(self.toggle_services)
        
        self.info_label = QLabel("Clique no interruptor para iniciar")
        self.info_label.setStyleSheet("color: #888; font-size: 12px;")

        self.qr_code_label = QLabel()
        self.qr_code_label.setFixedSize(300, 300)
        self.qr_code_label.setStyleSheet("background-color: #1b2a3a; border: 1px solid #333; border-radius: 12px;")
        self.qr_code_label.setAlignment(Qt.AlignCenter)

        self.desenv_label = QLabel("Desenvolvido por Daniel Boechat")
        self.desenv_label.setStyleSheet("color: #555; font-size: 11px;")

        self.link_label = QLabel("")
        self.link_label.setWordWrap(True)
        self.link_label.setAlignment(Qt.AlignCenter)
        self.link_label.setStyleSheet("color: #1f6feb; font-size: 11px; margin-top: 10px;")

        layout.addWidget(self.label_status, alignment=Qt.AlignCenter)
        layout.addWidget(self.switch, alignment=Qt.AlignCenter)
        layout.addWidget(self.info_label, alignment=Qt.AlignCenter)
        layout.addWidget(self.qr_code_label, alignment=Qt.AlignCenter)
        layout.addWidget(self.desenv_label, alignment=Qt.AlignCenter)
        layout.addWidget(self.link_label, alignment=Qt.AlignCenter)
        
        self.setLayout(layout)

    def toggle_services(self):
        if self.switch.isChecked():
            self.start_all()
        else:
            self.stop_all()

    def start_all(self):
        # DETECÇÃO INTELIGENTE DE CAMINHO
        if getattr(sys, 'frozen', False):
            # Se for executável, pega a pasta do binário
            current_dir = os.path.dirname(os.path.abspath(sys.executable))
        else:
            # Se for script .py normal
            current_dir = os.path.dirname(os.path.abspath(__file__))

        server_path = os.path.join(current_dir, "app.py")

        # Fallback para o seu caminho absoluto de desenvolvimento
        if not os.path.exists(server_path):
             server_path = "/media/daniel/Arquivos 1/Automacoes/Automacoes/Projeto 22 - Echo/Admin_Echo/app.py"

        if not os.path.exists(server_path):
             QMessageBox.critical(self, "Erro Fatal", f"Não encontrei o arquivo app.py em:\n{server_path}")
             self.switch.setChecked(False)
             return

        self.label_status.setText("Status: INICIANDO...")
        self.label_status.setStyleSheet("color: #FFD700;")
        
        if self.echo_thread is not None:
            self.echo_thread.stop()

        self.echo_thread = EchoThread(5000, server_path)
        self.echo_thread.ngrok_started.connect(self.on_success)
        self.echo_thread.error_occurred.connect(self.on_error)
        self.echo_thread.start()

    def on_success(self, url):
        self.label_status.setText("Status: ONLINE!")
        self.label_status.setStyleSheet("color: #4CAF50;")
        self.info_label.setText("Escaneie para conectar o Echo App:")
        self.link_label.setText(f"Link: {url}\n(Copiado!)")
        self.generate_qr_code(url)

    def on_error(self, error_msg):
        self.switch.setChecked(False)
        self.stop_all()
        QMessageBox.critical(self, "Erro de Inicialização", f"Falha: {error_msg}")

    def generate_qr_code(self, data):
        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        q_pixmap = QPixmap()
        q_pixmap.loadFromData(buffer.getvalue())
        self.qr_code_label.setPixmap(q_pixmap.scaled(280, 280, Qt.KeepAspectRatio, Qt.SmoothTransformation))

    def stop_all(self):
        if self.echo_thread:
            self.echo_thread.stop()
        self.label_status.setText("Status: DESLIGADO")
        self.label_status.setStyleSheet("color: #F44336;")
        self.info_label.setText("Clique no interruptor para iniciar")
        self.qr_code_label.clear()
        self.link_label.setText("")

    def closeEvent(self, event):
        self.stop_all()
        event.accept()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    ex = EchoControlPanel()
    ex.show()
    sys.exit(app.exec_())


    