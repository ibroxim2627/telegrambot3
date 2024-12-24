const express = require('express');
const cors = require('cors');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

const imgFolder = path.join(__dirname, 'img');

if (!fs.existsSync(imgFolder)) {
    fs.mkdirSync(imgFolder);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imgFolder);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
        }
    }
});

app.use(express.json());

app.use(cors({
    origin: 'http://localhost:3000',  // Barcha domenlar uchun ruxsat berish
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Barcha HTTP usullariga ruxsat berish
    allowedHeaders: ['Content-Type', 'Authorization'],  // Kerakli sarlavhalarga ruxsat berish
    credentials: true // Allow cookies and credentials
}));

app.get("/", (request, response) => {
    response.send("Hello World!");
})

app.get("/api/users", async (req, res) => {
    let query = "select * from users"
    const data = await pool.query(query)
    res.send(data.rows)
})

/************* GENRE ****************/
app.get("/api/genre", async (req, res) => {
    let query = "select * from genre"
    const data = await pool.query(query)
    res.send(data.rows)
})

app.post("/api/genre", async (req, res) => {
    const {id, type} = req.body
    let query;
    if (id) query = `update genre set type = '${type}' where id = ${id}`
    else query = `insert into genre (type) values ('${type}')`
    console.log(query)
    try {
        await pool.query(query)
        res.send({message: "Success"})
    } catch (e) {
        res.sendStatus(409)
        console.log("Error: ", e)
    }
})

app.delete("/api/genre", async (req, res) => {
    const {id} = req.query
    let query = `delete from genre where id = ${id}`
    try {
        await pool.query(query)
        res.send({message: "Success"})
    } catch (e) {
        res.sendStatus(409)
        console.log("Error: ", e)
    }
})

/************* MOVIE ****************/
app.get("/api/movie", async (req, res) => {
    let query = "select * from movie"
    const data = await pool.query(query)
    res.send(data.rows)
})
app.post("/api/movie", upload.single('img'), async (req, res) => {
    const { id, name, url, description, genre_id, code } = req.body;
    console.log(req.body)
    let img_url = null;
    console.log(id, id ? "salom" : "xayr")
    try {
        if (id) {
            // Oldingi rasm nomini bazadan olish
            const { rows } = await pool.query('SELECT img_url FROM movie WHERE id = $1', [id]);
            const oldImgUrl = rows[0]?.img_url;

            // Agar yangi fayl yuborilsa:
            if (req.file) {
                const oldImgPath = path.join(__dirname, 'img', oldImgUrl);

                // Eski faylni o'chirish
                if (oldImgUrl && fs.existsSync(oldImgPath)) {
                    await fs.unlinkSync(oldImgPath);
                }

                // Yangi fayl nomini o'rnatish
                img_url = req.file.filename;
            } else {
                // Fayl yuborilmasa, eski nom saqlanadi
                img_url = oldImgUrl;
            }

            // Ma'lumotni yangilash
            await pool.query(
                `UPDATE movie SET name = $1, url = $2, img_url = $3, description = $4, genre_id = $5, code = $6 WHERE id = $7`,
                [name, url, img_url, description, genre_id, code, id]
            );
        } else {
            // Yangi fayl yuklash
            img_url = req.file ? req.file.filename : null;

            // Ma'lumotni qo'shish
            await pool.query(
                `INSERT INTO movie (name, url, img_url, description, genre_id, code) VALUES ($1, $2, $3, $4, $5, $6)`,
                [name, url, img_url, description, genre_id, code]
            );
        }

        res.send({ message: "Success" });
    } catch (e) {
        res.sendStatus(409);
        console.error("Error: ", e);
    }
});



app.delete("/api/movie", async (req, res) => {
    const {id} = req.query
    let query = `delete from movie where id = ${id}`
    try {
        await pool.query(query)
        res.send({message: "Success"})
    } catch (e) {
        res.sendStatus(409)
        console.log("Error: ", e)
    }
})

app.get('/img/:imgName', async (req, res) => {
    try {
        const imgPath = path.join(imgFolder, req.params.imgName);

        // Fayl mavjudligini tekshirish
        if (!fs.existsSync(imgPath)) {
            return res.status(404).json({ message: 'Image not found' });
        }

        // MIME turini aniqlash va "Content-Type" o'rnatish
        res.set('Content-Type', 'image/' + path.extname(imgPath).substring(1));

        // Faylni yuborish
        res.sendFile(imgPath);
    } catch (err) {
        console.error('Error serving image:', err.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});


const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})