const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const MEME_DIR = path.join(__dirname, 'memes');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data', 'memes.json');
const LOG_FILE = path.join(__dirname, 'server.log');

function log(msg) {
    const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${t}] ${msg}`;
    log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/memes', express.static(MEME_DIR));

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, uuidv4() + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch (_) {}
    return [];
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadDescriptions() {
    const dp = path.join(__dirname, 'data', 'descriptions.json');
    try {
        if (fs.existsSync(dp)) return JSON.parse(fs.readFileSync(dp, 'utf-8'));
    } catch (_) {}
    return {};
}

function getBuiltinMemes() {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    const descs = loadDescriptions();
    const result = [];
    try {
        const files = fs.readdirSync(MEME_DIR);
        for (const f of files) {
            if (exts.has(path.extname(f).toLowerCase())) {
                const basename = path.parse(f).name;
                result.push({
                    id: 'b-' + basename,
                    file: '/memes/' + f,
                    desc: descs[f] || basename,
                    builtin: true
                });
            }
        }
    } catch (_) {}
    return result;
}

function getCustomMemes() {
    const data = loadData();
    return data.map((m, i) => ({
        id: 'c-' + i,
        file: '/uploads/' + m.filename,
        desc: m.desc,
        builtin: false
    }));
}

app.get('/api/memes', (req, res) => {
    const builtin = getBuiltinMemes();
    const custom = getCustomMemes();
    res.json({ memes: [...builtin, ...custom] });
});

app.post('/api/memes', upload.single('image'), (req, res) => {
    if (!req.file || !req.body.desc) {
        return res.status(400).json({ error: 'need image and desc' });
    }
    const data = loadData();
    data.push({ filename: req.file.filename, desc: req.body.desc });
    saveData(data);
    res.json({ ok: true });
});

app.delete('/api/memes/:id', (req, res) => {
    const data = loadData();
    const idx = parseInt(req.params.id);
    if (isNaN(idx) || idx < 0 || idx >= data.length) {
        return res.status(404).json({ error: 'not found' });
    }
    const removed = data.splice(idx, 1);
    if (removed[0] && removed[0].filename) {
        const fpath = path.join(UPLOAD_DIR, removed[0].filename);
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
    saveData(data);
    res.json({ ok: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function gitPull() {
    try {
        const cp = require('child_process');
        cp.execSync('git pull', { cwd: __dirname, stdio: 'pipe' });
        log('git pull: ok');
    } catch (e) {
        log('git pull: ' + (e.message || 'error'));
    }
}

gitPull();

app.listen(PORT, '0.0.0.0', () => {
    log(`сервер запущен: http://localhost:${PORT}`);
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                log(`  в сети: http://${iface.address}:${PORT}`);
            }
        }
    }
});
