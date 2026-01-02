const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_, res) => {
  res.json({ status: "OK" });
});
const proctoringRoutes = require("./routes/proctoring.routes");

app.use("/api/v2/proctoring", proctoringRoutes);
const adminProctoringRoutes = require("./routes/admin.proctoring.routes");

app.use("/api/v2/admin", adminProctoringRoutes);

module.exports = app;
