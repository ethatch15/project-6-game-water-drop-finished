// Game settings
const GAME_TIME = 30;        // Seconds per game
const START_LIVES = 3;       // Lives the player starts with
const CLEAN_POINTS = 4;      // Points for catching a clean drop
const MISS_PENALTY = 1;      // Points lost when a clean drop hits the ground
const WIN_SCORE = 40;        // Score needed to win
const DIRTY_CHANCE = 0.3;    // 30% of drops are dirty
const CATCHER_SPEED = 600;   // Pixels per second when using arrow keys

// Difficulty levels: how fast drops fall (pixels per second) and how often a germ appears
const DIFFICULTIES = {
  easy:   { fallSpeed: 120, germChance: 0 },
  medium: { fallSpeed: 180, germChance: 0 },
  hard:   { fallSpeed: 270, germChance: 0.12 }, // 12% of drops are game-ending germs
};

// Messages shown at the end of the game
const winMessages = [
  "Amazing! You brought clean water to a whole village!",
  "You did it! Every drop counts, and you caught a lot of them.",
  "Water hero! Clean water changes everything.",
];
const loseMessages = [
  "So close! Try again and catch more clean drops.",
  "Watch out for the dirty water! Give it another go.",
  "Keep trying. Every drop counts!",
];

// Grab elements from the page
const container = document.getElementById("game-container");
const catcher = document.getElementById("catcher");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const messageEl = document.getElementById("message");
const messageTitle = document.getElementById("message-title");
const messageText = document.getElementById("message-text");

// Variables to control game state
let gameRunning = false;
let score = 0;
let lives = START_LIVES;
let cleanCaught = 0;     // Clean drops caught this game
let cleanMissed = 0;     // Clean drops that hit the ground
let dirtyCaught = 0;     // Dirty drops caught
let timeLeft = GAME_TIME;
let drops = [];          // Drops currently on the screen
let dropMaker;           // Timer that creates drops regularly
let countdown;           // Timer that counts down the seconds
let lastFrame;           // Time of the last animation frame
let catcherX = 0;        // Left edge of the bucket, in pixels
let difficulty = "medium";
let caughtGerm = false;  // True if the player caught a germ (instant loss)
const keysDown = {};     // Which arrow keys are being held

// Show the winning score at the top
document.getElementById("goal").textContent = WIN_SCORE;

// Remember the "How to play" box so Reset can show it again
const howToPlayTitle = messageTitle.textContent;
const howToPlayText = messageText.innerHTML;

startBtn.addEventListener("click", startGame);
resetBtn.addEventListener("click", resetGame);

// Difficulty buttons: highlight the chosen one
const difficultyBtns = document.querySelectorAll(".difficulty-btn");
difficultyBtns.forEach((btn) => {
  btn.setAttribute("aria-checked", btn.dataset.level === difficulty);
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.level;
    difficultyBtns.forEach((b) => {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-checked", b === btn);
    });
  });
});

function startGame() {
  // Prevent multiple games from running at once
  if (gameRunning) return;

  // Reset everything for a new game
  gameRunning = true;
  score = 0;
  lives = START_LIVES;
  cleanCaught = 0;
  cleanMissed = 0;
  dirtyCaught = 0;
  caughtGerm = false;
  timeLeft = GAME_TIME;
  drops.forEach((d) => d.el.remove());
  drops = [];
  updateHud();

  messageEl.classList.add("hidden");
  startBtn.disabled = true;
  centerCatcher();

  // Create a new drop every 0.8 seconds
  dropMaker = setInterval(createDrop, 800);

  // Count down once per second
  countdown = setInterval(() => {
    timeLeft--;
    updateHud();
    if (timeLeft <= 0) endGame();
  }, 1000);

  // Start the animation loop
  lastFrame = performance.now();
  requestAnimationFrame(gameLoop);
}

function createDrop() {
  const drop = document.createElement("div");

  // Roll once to decide the type: germ (hard mode only), dirty, or clean
  const roll = Math.random();
  const germChance = DIFFICULTIES[difficulty].germChance;
  const isGerm = roll < germChance;
  const isDirty = !isGerm && roll < germChance + DIRTY_CHANCE;
  drop.className = isGerm ? "germ" : isDirty ? "water-drop dirty-drop" : "water-drop";

  // Make drops different sizes for visual variety
  const size = 40 * (Math.random() * 0.5 + 0.75);
  drop.style.width = `${size}px`;
  drop.style.height = `${size}px`;

  // Position the drop randomly across the game width
  const x = Math.random() * (container.clientWidth - size);
  drop.style.left = `${x}px`;

  container.appendChild(drop);
  drops.push({ el: drop, x, y: -size, size, isDirty, isGerm });
}

function gameLoop(now) {
  if (!gameRunning) return;

  // Seconds since the last frame, so speed is the same on fast and slow screens
  // (capped so drops can't skip past the bucket if the browser lags)
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  moveCatcherWithKeys(dt);

  const groundY = container.clientHeight;
  const bucketTop = catcher.offsetTop;
  const bucketLeft = catcherX;
  const bucketRight = catcherX + catcher.offsetWidth;
  const fallSpeed = DIFFICULTIES[difficulty].fallSpeed;

  // Move each drop down and check whether it was caught or missed
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.y += fallSpeed * dt;
    // Use translate (not transform) so the drop's rotation doesn't tilt its fall
    d.el.style.translate = `0 ${d.y}px`;

    const centerX = d.x + d.size / 2;
    const bottom = d.y + d.size;
    const caught =
      bottom >= bucketTop + 10 &&
      d.y < bucketTop + 30 &&
      centerX >= bucketLeft &&
      centerX <= bucketRight;

    if (caught) {
      if (d.isGerm) {
        // Catching a germ ends the game right away
        caughtGerm = true;
        flash("hit");
        removeDrop(i);
        break;
      } else if (d.isDirty) {
        lives--;
        dirtyCaught++;
        flash("hit");
      } else {
        score += CLEAN_POINTS;
        cleanCaught++;
        flash("catch");
      }
      removeDrop(i);
    } else if (d.y > groundY) {
      // Only clean drops cost points when they hit the ground
      if (!d.isDirty && !d.isGerm) {
        score -= MISS_PENALTY;
        cleanMissed++;
      }
      removeDrop(i);
    }
  }

  updateHud();

  if (lives <= 0 || caughtGerm) {
    endGame();
    return;
  }

  requestAnimationFrame(gameLoop);
}

function removeDrop(index) {
  drops[index].el.remove();
  drops.splice(index, 1);
}

// Stop timers and clear the drops off the screen
function stopGame() {
  gameRunning = false;
  clearInterval(dropMaker);
  clearInterval(countdown);
  drops.forEach((d) => d.el.remove());
  drops = [];
}

// Reset button: stop any game and go back to the start screen
function resetGame() {
  stopGame();
  score = 0;
  lives = START_LIVES;
  timeLeft = GAME_TIME;
  updateHud();
  document.querySelectorAll(".confetti").forEach((c) => c.remove());

  messageTitle.textContent = howToPlayTitle;
  messageText.innerHTML = howToPlayText;
  messageEl.classList.remove("hidden");

  startBtn.disabled = false;
  startBtn.textContent = "Start Game";
  centerCatcher();
}

function endGame() {
  if (!gameRunning) return;
  stopGame();

  // A perfect game: caught every clean drop and no dirty ones
  const perfect = !caughtGerm && cleanCaught > 0 && cleanMissed === 0 && dirtyCaught === 0;

  // Pick a random message from the right list
  const won = !caughtGerm && (perfect || (score >= WIN_SCORE && lives > 0));
  const list = won ? winMessages : loseMessages;
  const message = list[Math.floor(Math.random() * list.length)];

  if (caughtGerm) {
    messageTitle.textContent = "You lose! 🦠";
    messageText.innerHTML = `You caught a germ! Germs make water unsafe to drink.<br>Final score: <strong>${score}</strong>`;
  } else if (perfect) {
    messageTitle.textContent = "You win! 🎉";
    messageText.innerHTML = `Perfect game! You caught every clean drop.<br>Final score: <strong>${score}</strong>`;
  } else {
    messageTitle.textContent = won ? "You win! 🎉" : lives <= 0 ? "Out of lives!" : "Time's up!";
    messageText.innerHTML = `Final score: <strong>${score}</strong><br>${message}`;
  }

  // Confetti for every win
  if (won) launchConfetti();

  messageEl.classList.remove("hidden");

  startBtn.disabled = false;
  startBtn.textContent = "Play Again";
}

function updateHud() {
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;
  livesEl.textContent = "❤️".repeat(Math.max(lives, 0)) + "🖤".repeat(START_LIVES - Math.max(lives, 0));
}

// Briefly color the container when a drop is caught
function flash(type) {
  container.classList.remove("flash-catch", "flash-hit");
  void container.offsetWidth; // Restart the animation
  container.classList.add(`flash-${type}`);
}

// ----- Confetti -----

// Drops colorful paper pieces from the top of the screen
function launchConfetti() {
  const colors = ["#FFC907", "#2E9DF7", "#8BD1CB", "#4FCB53", "#FF902A", "#F5402C", "#F16061"];
  for (let i = 0; i < 150; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2.5 + Math.random() * 2}s`;
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.setProperty("--drift", `${Math.random() * 200 - 100}px`);
    document.body.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

// ----- Moving the bucket -----

function setCatcherX(x) {
  const maxX = container.clientWidth - catcher.offsetWidth;
  catcherX = Math.min(Math.max(x, 0), maxX);
  catcher.style.left = `${catcherX}px`;
}

function centerCatcher() {
  setCatcherX((container.clientWidth - catcher.offsetWidth) / 2);
}

// Mouse and finger: the bucket follows the pointer
function moveCatcherToPointer(e) {
  const rect = container.getBoundingClientRect();
  setCatcherX(e.clientX - rect.left - catcher.offsetWidth / 2);
}
container.addEventListener("pointermove", moveCatcherToPointer);
container.addEventListener("pointerdown", moveCatcherToPointer); // A tap jumps the bucket there
container.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// Arrow keys (or A / D)
document.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) {
    keysDown[e.key] = true;
    e.preventDefault();
  }
});
document.addEventListener("keyup", (e) => {
  keysDown[e.key] = false;
});

function moveCatcherWithKeys(dt) {
  let dir = 0;
  if (keysDown.ArrowLeft || keysDown.a) dir -= 1;
  if (keysDown.ArrowRight || keysDown.d) dir += 1;
  if (dir !== 0) setCatcherX(catcherX + dir * CATCHER_SPEED * dt);
}

// Keep the bucket inside the box when the window is resized
window.addEventListener("resize", () => setCatcherX(catcherX));
window.addEventListener("load", centerCatcher);
