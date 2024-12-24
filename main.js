const express = require('express');
const cors = require('cors');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');


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
    origin: '*',  // Barcha domenlar uchun ruxsat berish
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




// *************************** BOT SOURCE CODE ****************************** ///


const token = '7549800359:AAHbe6fLIUa9BBDCz7xwuNdjjKYSGp0Pipw';

const bot = new TelegramBot(token, {polling: true});

const channels = [-1002170742320]

let genreId;
let page = 0;
let limit = 10;

bot.on("message", async (message) => {
    console.log("message", message)
    const chatId = message.chat.id;
    const userId = message.from.id;

    let check_user = await pool?.query("SELECT * FROM users WHERE telegram_id = $1", [chatId]);
    if (check_user.rowCount === 0) {
        await bot.sendMessage(chatId, "Salom " + message.from.first_name + "\n Iltimos telefon raqamingizni yuboring", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: [
                    [
                        {text: "Telefon raqamni yuborish", request_contact: true}
                    ]
                ]
            }
        })
    } else {
        let isSubscribed = await checkSubscribe(userId);
        if (isSubscribed) {
            if(message.text.startsWith("🎬")){
                page = 0
                let type = message.text.split("🎬")[1].trim()
                let genreQuery = "select * from genre where type = $1"
                const genreData = await pool.query(genreQuery, [type])
                if(genreData.rowCount === 1){
                    const genre = genreData.rows[0]
                    genreId = genre.id
                    let offset = page * limit
                    const movieQuery = "select * from movie where genre_id = $1 offset $2 limit $3"
                    const movieCount = "select count(*) from movie where genre_id = $1"
                    const data = await pool.query(movieQuery, [genreId, offset, limit])
                    const {rows} = await pool.query(movieCount, [genreId])
                    if(data.rowCount > 0){
                        let msg = "Kinolar:\n"
                        for (const movie of data.rows){
                            msg += movie.code +  " - " + movie.name + "\n";
                        }
                        let inlineKeyboard = []
                        if (Math.ceil(+rows[0]?.count / limit) > 1){
                            inlineKeyboard.push([
                                {text: "➡️",  callback_data: "/next"}
                            ])
                        }
                        bot.sendMessage(chatId, msg, inlineKeyboard.length ? {
                            reply_markup: {
                                inline_keyboard: inlineKeyboard
                            }
                        } : {})
                    }else bot.sendMessage(chatId, "Bu janrda xech qanday kino mavjud emas")
                }else bot.sendMessage(chatId, "Bunday janr mavjud emas")

            } else{
                genreId = undefined
                page = 0
                switch (message.text) {
                    case "/start":
                        bot.sendMessage(chatId, `Assalomu alaykum ${message.from.first_name}!`, {
                            reply_markup: {
                                resize_keyboard: true,
                                keyboard: [
                                    [
                                        {text: "Genre"},
                                        {text: "Movie"},
                                    ],
                                ]
                            }
                        });
                        break
                    case "Back":
                        bot.sendMessage(chatId, `Main menu`, {
                            reply_markup: {
                                resize_keyboard: true,
                                keyboard: [
                                    [
                                        {text: "Genre"},
                                        {text: "Movie"},
                                    ],
                                ]
                            }
                        });
                        break
                    case "Genre":
                        let query = "select * from genre"
                        const data = await pool.query(query)
                        let btn = []
                        for (let i = 0; i < data.rowCount; i++) {
                            if (!(i % 3)){
                                let arr = []
                                for (let j = i; j < i + 3; j++) {
                                    if(data.rows[j]) arr.push({text: "🎬" + data.rows[j]?.type})
                                }
                                btn.push(arr)
                            }
                        }
                        btn.push([{text: "Back"}])
                        bot.sendMessage(chatId, "Genre", {
                            reply_markup: {
                                resize_keyboard: true,
                                keyboard: btn
                            }
                        })
                        break
                    case "Movie":
                        page = 0
                        const {rows} = await pool.query("select count(*) from movie")
                        const movieData = await pool.query("select * from movie offset $1 limit $2", [page * limit, limit])
                        if (movieData.rowCount > 0){
                            let msg = "Kinolar:\n"
                            for (const movie of movieData.rows){
                                msg += movie.code +  " - " + movie.name + "\n";
                            }
                            let inlineKeyboard = []
                            if (Math.ceil(+rows[0]?.count / limit) > 1){
                                inlineKeyboard.push([
                                    {text: "➡️",  callback_data: "/next"}
                                ])
                            }
                            console.log(inlineKeyboard)
                            bot.sendMessage(chatId, msg, {
                                reply_markup: {
                                    resize_keyboard: true,
                                    inline_keyboard: inlineKeyboard.length ? inlineKeyboard : []
                                }
                            })
                        }else bot.sendMessage(chatId, "Xech qanday kino mavjud emas")
                        break
                    default :{
                        let query = "select * from movie where code = $1"
                        const data = await pool.query(query, [message.text])
                        if (data.rowCount > 0) {
                            bot.sendPhoto(chatId, path.join(__dirname, `./img/${data.rows[0]?.img_url}`),
                                {
                                    caption: data.rows[0]?.description,
                                    reply_markup: {
                                        inline_keyboard: [
                                            [
                                                {
                                                    text: "Kinoni korish",
                                                    web_app: {url: data.rows[0]?.url}
                                                }
                                            ]
                                        ]
                                    }
                                }
                            )
                        }else {
                            bot.sendMessage(chatId, "Bunday kodli film topilmadi")
                        }
                        break
                    }
                }
            }
        } else {
            bot.sendMessage(chatId, "Siz ushbu kanalllarga obuna bo'ling!", {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Obuna bo'lish",
                                url: "https://t.me/+VILaQAu1NQM1YjQy"
                            }
                        ]
                    ]
                }
            })
        }
    }

})


bot.on('contact', async (msg) => {
    console.log(msg);
    const chatId = msg?.chat?.id;
    const username = msg?.chat?.username;
    const firstName = msg?.contact?.first_name
    const lastName = msg?.contact?.last_name
    const phoneNumber = msg?.contact?.phone_number
    try {
        const query = "INSERT INTO users (telegram_id, first_name, last_name, username, phone) VALUES ( $1, $2, $3, $4, $5 )"
        await pool?.query(query, [chatId, firstName, lastName, username, phoneNumber])
        await bot.sendMessage(chatId, "Rahmat! Siz muvaffaqiyatli ro'yxatdan o'tdingiz", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: [
                    [
                        {text: "Genre"},
                        {text: "Movie"},
                    ],
                ]
            }
        })
    } catch (err) {
        console.log(err)
        await bot.sendMessage(chatId, "Ma'lumotlarni saqlashda xatolik yuz berdi\n" + err)
    }
})

bot.on('callback_query', async (message) => {
    console.log(message)
    const chatId = message?.message?.chat?.id;
    const messageId = message?.message?.message_id;
    switch (message.data){
        case "/next": {
            if (genreId) {
                page += 1
                let offset = page * limit
                const movieQuery = "select * from movie where genre_id = $1 offset $2 limit $3"
                const data = await pool.query(movieQuery, [genreId, offset, limit])
                const {rows} = await pool.query("select count(*) from movie where genre_id = $1", [genreId])
                if(data.rowCount > 0) {
                    let msg = "Kinolar:\n"
                    for (const movie of data.rows) {
                        msg += movie.code + " " + movie.name + "\n";
                    }
                    let inlineKeyboard = []
                    if (page === 0) {
                        inlineKeyboard.push([
                            {text: "➡️", callback_data: "/next"}
                        ])
                    } else if (Math.ceil(rows[0].count / limit) === page + 1){
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                        ])
                    }else {
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                            {text: "➡️", callback_data: "/next"}
                        ])
                    }
                    bot.editMessageText(msg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    })
                } else bot.sendMessage(chatId, "Bu janrda xech qanday kino mavjud emas")
            }else {
                page += 1
                let offset = page * limit
                const movieQuery = "select * from movie offset $1 limit $2"
                const data = await pool.query(movieQuery, [offset, limit])
                const {rows} = await pool.query("select count(*) from movie")

                if(data.rowCount > 0) {
                    let msg = "Kinolar:\n"
                    for (const movie of data.rows) {
                        msg += movie.code + " " + movie.name + "\n";
                    }
                    let inlineKeyboard = []
                    if (page === 0) {
                        inlineKeyboard.push([
                            {text: "➡️", callback_data: "/next"}
                        ])
                    } else if (Math.ceil(rows[0].count / limit) === page + 1){
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                        ])
                    }else {
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                            {text: "➡️", callback_data: "/next"}
                        ])
                    }
                    bot.editMessageText(msg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    })
                } else bot.sendMessage(chatId, "kino mavjud emas")
            }
            break
        }
        case "/back": {
            if (genreId) {
                page -= 1
                let offset = page * limit
                const movieQuery = "select * from movie where genre_id = $1 offset $2 limit $3"
                const data = await pool.query(movieQuery, [genreId, offset, limit])
                const {rows} = await pool.query("select count(*) from movie where genre_id = $1", [genreId])
                if(data.rowCount > 0) {
                    let msg = "Kinolar:\n"
                    for (const movie of data.rows) {
                        msg += movie.code + " " + movie.name + "\n";
                    }
                    let inlineKeyboard = []
                    if (page === 0) {
                        inlineKeyboard.push([
                            {text: "➡️", callback_data: "/next"}
                        ])
                    } else if (Math.ceil(rows[0].count / limit) === page + 1){
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                        ])
                    }else {
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                            {text: "➡️", callback_data: "/next"}
                        ])
                    }
                    bot.editMessageText(msg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    })
                } else bot.sendMessage(chatId, "Bu janrda xech qanday kino mavjud emas")
            }else {
                page -= 1
                let offset = page * limit
                const movieQuery = "select * from movie offset $1 limit $2"
                const data = await pool.query(movieQuery, [offset, limit])
                const {rows} = await pool.query("select count(*) from movie")

                if(data.rowCount > 0) {
                    let msg = "Kinolar:\n"
                    for (const movie of data.rows) {
                        msg += movie.code + " " + movie.name + "\n";
                    }
                    let inlineKeyboard = []
                    if (page === 0) {
                        inlineKeyboard.push([
                            {text: "➡️", callback_data: "/next"}
                        ])
                    } else if (Math.ceil(rows[0].count / limit) === page + 1){
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                        ])
                    }else {
                        inlineKeyboard.push([
                            {text: "⬅️", callback_data: "/back"},
                            {text: "➡️", callback_data: "/next"}
                        ])
                    }
                    bot.editMessageText(msg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    })
                } else bot.sendMessage(chatId, "kino mavjud emas")
            }
            break
        }
    }
})

const checkSubscribe = async (userId) => {
    let isSubscribed = true;

    for (const channel of channels) {
        try {
            const response = await bot.getChatMember(channel, userId)
            console.log(response)
            if (response.status === "left" || response.status === "kicked") {
                isSubscribed = false;
            }
        } catch (err) {
            isSubscribed = false
        }
    }

    return isSubscribed
}