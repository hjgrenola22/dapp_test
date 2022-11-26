

const express = require("express");
const path = require("path")
const bodyparser = require("body-parse")

const PORT = 3000
const HOST = "0.0.0.0"
const app = express();

app.use(express.static(path.join(__dirname,"views")))

app.listen(PORT,HOST)


