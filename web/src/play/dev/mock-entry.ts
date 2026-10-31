// Dev entry for mock.html: mounts the real phone client at /p, exactly as L7's router will.
import { mountPlay } from "../index"

const app = document.getElementById("app")
if (!app) throw new Error("mock.html needs #app")
mountPlay(app)
