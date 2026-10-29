// Browser static-plugin smoke. Desktop must load eve_toy before this script.
local toy = eve.ToyPlugin();
local pending = null;
local started = toy.begin("isSupport", ["getCloudStorage"]);
if (!started.ok) throw started.status.summary;
pending = started.value;

eve_update <- function(dt) {
    if (pending == null) return;
    local checked = toy.poll(pending);
    if (!checked.ok) throw checked.status.summary;
    local packet = checked.value;
    if (packet.state == "pending") return;
    pending = null;
    if (packet.state == "succeeded") {
        print("Toy getCloudStorage supported: " + packet.value + "\n");
    } else {
        print("Toy SDK unavailable: " + packet.error.type + ": " + packet.error.message + "\n");
    }
};
