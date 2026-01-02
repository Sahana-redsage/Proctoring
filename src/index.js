const app = require("./app");
const { PORT } = require("./config/env");

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
