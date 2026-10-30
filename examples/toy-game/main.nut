// Arrow keys move the blue square. Avoid the falling red square.
// Simulation uses only the supplied dt and a deterministic obstacle sequence.
persist playerX = 384.0
persist hazardX = 80.0
persist hazardY = -40.0
persist rounds = 0
local toy = null;
local supportToken = null;
local evidenceFrames = 0;
local evidenceSaved = false;
local movementReported = false;

eve_init = function() {
    gfx.setBackgroundColor(0.035, 0.05, 0.09, 1.0);
    toy = eve.ToyPlugin();
    local started = toy.begin("isSupport", ["getCloudStorage"]);
    if (!started.ok) throw started.status.summary;
    supportToken = started.value;
    print("[toy-game] EVEngine game initialized\n");
};
eve_update = function(dt) {
    evidenceFrames += 1;
    if (!evidenceSaved && evidenceFrames > 60 && evidenceFrames < 65) {
        evidenceSaved = gfx.saveFramePng("/tmp/toy-game-frame.png");
        if (evidenceSaved) print("[toy-game] engine-owned frame captured\n");
    }
    if (supportToken != null) {
        local checked = toy.poll(supportToken);
        if (!checked.ok) throw checked.status.summary;
        if (checked.value.state != "pending") {
            print("[toy-game] SDK request: " + checked.value.state + "\n");
            supportToken = null;
        }
    }
    if (keyboard.isDown("left")) playerX -= 300.0 * dt;
    if (keyboard.isDown("right")) playerX += 300.0 * dt;
    if (!movementReported && playerX > 430.0) {
        print("[toy-game] keyboard movement verified x=" + playerX + "\n");
        movementReported = true;
    }
    if (playerX < 0.0) playerX = 0.0;
    if (playerX > 768.0) playerX = 768.0;
    hazardY += (180.0 + rounds * 8.0) * dt;
    if (hazardY > 600.0) {
        rounds += 1;
        hazardY = -40.0;
        hazardX = ((rounds * 173) % 740).tofloat();
    }
    if (hazardY + 40.0 > 530.0 && hazardY < 562.0 && hazardX + 40.0 > playerX && hazardX < playerX + 32.0) {
        rounds = 0;
        hazardY = -40.0;
        hazardX = 80.0;
        playerX = 384.0;
        print("[toy-game] collision: round reset\n");
    }
};
eve_render = function() {
    gfx.clear();
    gfx.drawSolidRect(0.0, 574.0, 800.0, 2.0, 0.2, 0.3, 0.45, 1.0);
    gfx.drawSolidRect(playerX, 530.0, 32.0, 32.0, 0.1, 0.7, 1.0, 1.0);
    gfx.drawSolidRect(hazardX, hazardY, 40.0, 40.0, 1.0, 0.25, 0.3, 1.0);
};
