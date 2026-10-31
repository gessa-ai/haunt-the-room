// Entry for the audition page (dev.html). L7 can mount the same page elsewhere with mountAudition(root).
import { mountAudition } from "./audition"

mountAudition(document.getElementById("audition") ?? document.body)
