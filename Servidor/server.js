import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import cors from "cors";
import session from "express-session";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middlewares
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "Admin_Echo")));
app.use(session({
  secret: "echo_secret_key", // chave de sessão
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // true só com https
}));

// Caminho do arquivo users.js
const usersFile = "D:\\Desenvolvimento\\Projeto_Echo\\Echo_app\\users.js";

// Credenciais fixas
import { ADMIN_CREDENTIALS } from "./Admin_Echo/credentials.js";

// Middleware de proteção
function authMiddleware(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Não autorizado" });
  }
}

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  ) {
    req.session.loggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Credenciais inválidas" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Buscar usuários (somente logado)
app.get("/users", authMiddleware, (req, res) => {
  if (!fs.existsSync(usersFile)) {
    return res.json([]);
  }
  import(usersFile + "?t=" + Date.now())
    .then((module) => {
      res.json(module.USERS);
    })
    .catch(() => res.json([]));
});

// Salvar usuários (somente logado)
app.post("/users", authMiddleware, (req, res) => {
  const users = req.body;
  const content = `export const USERS = ${JSON.stringify(users, null, 2)};\n`;
  fs.writeFile(usersFile, content, (err) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Erro ao salvar usuários" });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
