import { Store } from "./store.js";
import { Haven } from "./core.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT || 8811);
const HOST = process.env.HOST || "127.0.0.1"; // local only by default
const store = new Store(process.env.HAVEN_DATA || new URL("../data/haven.json", import.meta.url).pathname);
const haven = new Haven({ store });
if (seed(haven)) console.log("seeded market + house starter jobs");
const srv = createApp(haven).listen(PORT, HOST, () => console.log(`Anansi Haven (prototype) on http://${HOST}:${srv.address().port}  mcp: /mcp  docs: /llms.txt`));
