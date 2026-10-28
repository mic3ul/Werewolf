const ROLE_NAMES = {
  wolf: "المستذئب",
  qais: "قيس، عرّاف الأسرار",
  doctor: "الطبيب",
  villager: "قروي",
};

const ROLE_DESCRIPTIONS = {
  wolf: "أنت المستذئب. اختر لاعبًا حيًا ليُقصى أثناء الليل. يتعين على المستذئبين الأحياء الاتفاق بالتصويت.",
  qais: "أنت قيس، عرّاف الأسرار — شخصية أصلية في WeirdWolf. كل ليلة افحص لاعبًا واحدًا لتعرف دوره سرًا.",
  doctor: "أنت الطبيب. كل ليلة اختر لاعبًا واحدًا لتحميه من هجوم المستذئبين.",
  villager: "أنت قروي. ناقشوا الأحداث نهارًا وصوّتوا لإقصاء من تشكّون بأنه مستذئب.",
};

const TELEGRAM_API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function telegram(env, method, payload) {
  const response = await fetch(TELEGRAM_API(env.BOT_TOKEN, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error("Telegram API request failed:", method, result.description || response.status);
  }
  return result;
}

// GIF-first messaging: every bot message attempts to send an animation.
// If Telegram rejects the GIF or caption, deliver the text reliably as a fallback.
const GAME_GIFS = {
  // Themed animations: werewolf horror, village celebration, and game events.
  werewolf: "https://media1.giphy.com/media/14ypz3rg3Ziz8A/giphy.gif",
  night: "https://media1.giphy.com/media/qSqjILPWroxh3XER4f/giphy.gif",
  day: "https://media1.giphy.com/media/2ALaD4gPCLPvzHfSpK/giphy.gif",
  villageWin: "https://media1.giphy.com/media/2ALaD4gPCLPvzHfSpK/giphy.gif",
  wolvesWin: "https://media1.giphy.com/media/xzuD8qRHBONOuqdnBm/giphy.gif",
  eliminated: "https://media1.giphy.com/media/qSqjILPWroxh3XER4f/giphy.gif",
  protected: "https://media1.giphy.com/media/2ALaD4gPCLPvzHfSpK/giphy.gif",
  vote: "https://media1.giphy.com/media/2ALaD4gPCLPvzHfSpK/giphy.gif",
  default: "https://media1.giphy.com/media/14ypz3rg3Ziz8A/giphy.gif",
};

async function sendPlainMessage(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", { chat_id: chatId, text, ...extra });
}

function gifForMessage(content) {
  if (/نجت القرية|لم يبقَ أي مستذئب|انتصرت القرية|فاز القرويون/i.test(content)) return GAME_GIFS.villageWin;
  if (/انتصَر المستذئبون|انتصر المستذئبون|سيطروا على القرية|فاز المستذئبون/i.test(content)) return GAME_GIFS.wolvesWin;
  if (/حلّ الليل|المستذئبون|بطاقة دورك|رفقاء الليل|اختر هدف المستذئبين|☠️|لم ينجُ/i.test(content)) return GAME_GIFS.werewolf;
  if (/بدأ النهار|مرّت الليلة دون إقصاء|نجا|🛡️/i.test(content)) return GAME_GIFS.day;
  if (/صوّتت القرية|انتهى التصويت|تسجيل صوت|⚖️|🗳️/i.test(content)) return GAME_GIFS.vote;
  if (/انتهت الجولة الحالية|إلغاء الجولة/i.test(content)) return GAME_GIFS.eliminated;
  return GAME_GIFS.default;
}

async function sendMessage(env, chatId, text, extra = {}) {
  const content = String(text);
  const animation = gifForMessage(content);

  // Telegram animation captions are limited to 1024 characters.
  const caption = content.length <= 1024 ? content : content.slice(0, 1000) + "…";
  const animated = await telegram(env, "sendAnimation", {
    chat_id: chatId,
    animation,
    caption,
    ...extra,
  });
  if (animated.ok) {
    if (content.length > 1024) {
      await sendPlainMessage(env, chatId, content.slice(1000));
    }
    return animated;
  }
  console.warn("GIF message failed; falling back to text:", animated.description || "unknown error");
  return sendPlainMessage(env, chatId, content, extra);
}

async function sendGameMoment(env, chatId, text, mood, extra = {}) {
  const animation = GAME_GIFS[mood] || GAME_GIFS.default;
  // This helper explicitly selects the requested game-moment GIF.
  const content = String(text);
  const caption = content.length <= 1024 ? content : content.slice(0, 1000) + "…";
  const result = await telegram(env, "sendAnimation", {
    chat_id: chatId,
    animation,
    caption,
    ...extra,
  });
  if (result.ok) {
    if (content.length > 1024) await sendPlainMessage(env, chatId, content.slice(1000));
    return result;
  }
  console.warn("Animation failed; falling back to text:", mood, result.description || "");
  return sendPlainMessage(env, chatId, content, extra);
}

const answerCallback = (env, callbackId, text) =>
  telegram(env, "answerCallbackQuery", { callback_query_id: callbackId, text });

function playerName(player) {
  return player.firstName || player.username || `Player ${player.userId}`;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildRoles(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < 4) {
    throw new RangeError("WeirdWolf requires at least four players.");
  }
  const wolfCount = Math.max(1, Math.floor(playerCount / 4));
  const roles = Array(wolfCount).fill("wolf");
  if (playerCount >= 5) roles.push("doctor");
  roles.push("qais");
  while (roles.length < playerCount) roles.push("villager");
  return shuffle(roles);
}

export function getWinner(players) {
  const alive = players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === "wolf").length;
  const others = alive.length - wolves;
  if (wolves === 0) return "village";
  if (wolves >= others) return "wolves";
  return null;
}

function commandOf(message) {
  if (!message?.text || !message.text.startsWith("/")) return null;
  return message.text.trim().split(/\s+/)[0].split("@")[0].slice(1).toLowerCase();
}

function chatIsGroup(chat) {
  return chat?.type === "group" || chat?.type === "supergroup";
}

async function getRoom(env, chatId) {
  const row = await env.DB.prepare("SELECT data FROM rooms WHERE chat_id = ?")
    .bind(String(chatId)).first();
  return row ? JSON.parse(row.data) : null;
}

async function saveRoom(env, room) {
  room.updatedAt = Date.now();
  await env.DB.prepare(
    "INSERT INTO rooms (chat_id, data, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(chat_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).bind(String(room.chatId), JSON.stringify(room), room.updatedAt).run();
}

async function hasStarted(env, userId) {
  return Boolean(await env.DB.prepare("SELECT user_id FROM started_users WHERE user_id = ?")
    .bind(String(userId)).first());
}

async function markStarted(env, user) {
  await env.DB.prepare(
    "INSERT INTO started_users (user_id, username, first_name, started_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name",
  ).bind(String(user.id), user.username || null, user.first_name || null, Date.now()).run();
}

function roleKeyboard(room, actor, action) {
  const targets = room.players.filter((player) =>
    player.alive && player.userId !== actor.userId &&
    (action !== "kill" || player.role !== "wolf"));
  return {
    inline_keyboard: targets.map((target) => [{
      text: playerName(target),
      callback_data: `n:${room.chatId}:${action}:${target.userId}`,
    }]),
  };
}

function dayKeyboard(room) {
  const targets = room.players.filter((player) => player.alive);
  const rows = [];
  for (let i = 0; i < targets.length; i += 2) {
    rows.push(targets.slice(i, i + 2).map((target) => ({
      text: playerName(target),
      callback_data: `d:${room.chatId}:${target.userId}`,
    })));
  }
  return { inline_keyboard: rows };
}

async function openNight(env, room) {
  room.phase = "night";
  room.round += 1;
  room.actions = { killVotes: {}, protect: null, inspect: null };
  room.votes = {};
  await saveRoom(env, room);
  await sendGameMoment(env, room.chatId,
    `🌙 حلّ الليل ${room.round}. الأدوار الخاصة تتلقى خياراتها في الخاص؛ انتظروا حتى يعلن البوت النتيجة.`, "night");
  const living = room.players.filter((player) => player.alive);
  for (const player of living) {
    if (!["wolf", "doctor", "qais"].includes(player.role)) continue;
    const action = player.role === "wolf" ? "kill" : player.role === "doctor" ? "protect" : "inspect";
    const prompt = action === "kill"
      ? "اختر هدف المستذئبين لهذه الليلة:"
      : action === "protect"
        ? "اختر لاعبًا لتحميه هذه الليلة:"
        : "يا قيس، اختر لاعبًا لتكشف دوره سرًا:";
    await sendMessage(env, player.userId, prompt, {
      reply_markup: roleKeyboard(room, player, action),
    });
  }
}

async function startGame(env, room) {
  const roles = buildRoles(room.players.length);
  const shuffledPlayers = shuffle(room.players);
  shuffledPlayers.forEach((player, index) => {
    player.role = roles[index];
    player.alive = true;
  });
  room.players = shuffledPlayers;
  room.phase = "night";
  room.round = 0;
  room.actions = { killVotes: {}, protect: null, inspect: null };
  room.votes = {};
  await saveRoom(env, room);

  const failed = [];
  for (const player of room.players) {
    const result = await sendMessage(env, player.userId,
      `🎭 WeirdWolf — بطاقة دورك\n\nدورك: ${ROLE_NAMES[player.role]}\n\n${ROLE_DESCRIPTIONS[player.role]}\n\nلا تشارك هذه البطاقة مع المجموعة.`);
    if (!result.ok) failed.push(playerName(player));
  }
  if (failed.length) {
    room.phase = "finished";
    await saveRoom(env, room);
    await sendMessage(env, room.chatId,
      `تعذّر إرسال بطاقة الدور إلى: ${failed.join("، ")}. أُوقفت الجولة قبل بدء اللعب. على كل لاعب فتح البوت والضغط على Start ثم إنشاء جولة جديدة.`);
    return;
  }
  const wolves = room.players.filter((player) => player.role === "wolf").map(playerName);
  for (const player of room.players.filter((player) => player.role === "wolf")) {
    await sendMessage(env, player.userId, `رفقاء الليل: ${wolves.join("، ")}`);
  }
  await sendMessage(env, room.chatId,
    `بدأت الجولة! أُرسلت الأدوار سرًا إلى اللاعبين. تذكّروا: قيس، عرّاف الأسرار، شخصية خاصة في WeirdWolf.\n\nعدد اللاعبين: ${room.players.length}`);
  await openNight(env, room);
}

async function checkAndFinish(env, room) {
  const winner = getWinner(room.players);
  if (!winner) return false;
  room.phase = "finished";
  await saveRoom(env, room);
  const message = winner === "wolves"
    ? "🐺 انتصر المستذئبون! سيطروا على القرية."
    : "🌅 نجت القرية! لم يبقَ أي مستذئب.";
  await sendGameMoment(env, room.chatId, `${message}\nاكتب /newgame لبدء جولة جديدة.`, winner === "wolves" ? "wolvesWin" : "villageWin");
  return true;
}

async function resolveNight(env, room) {
  const alive = room.players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === "wolf");
  const doctor = alive.find((player) => player.role === "doctor");
  const qais = alive.find((player) => player.role === "qais");
  if (!wolves.every((player) => room.actions.killVotes[player.userId])) return;
  if (doctor && !room.actions.protect) return;
  if (qais && !room.actions.inspect) return;

  const counts = new Map();
  for (const targetId of Object.values(room.actions.killVotes)) {
    counts.set(String(targetId), (counts.get(String(targetId)) || 0) + 1);
  }
  const highScore = Math.max(0, ...counts.values());
  const candidates = [...counts.entries()].filter((entry) => entry[1] === highScore).map(([id]) => id);
  const targetId = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  const protectedId = room.actions.protect ? String(room.actions.protect.targetId) : null;
  const victim = targetId && targetId !== protectedId
    ? room.players.find((player) => player.userId === String(targetId) && player.alive)
    : null;
  if (victim) victim.alive = false;

  const inspection = room.actions.inspect;
  if (inspection) {
    const inspector = room.players.find((player) => player.userId === String(inspection.actorId));
    const target = room.players.find((player) => player.userId === String(inspection.targetId));
    if (inspector && target) {
      await sendMessage(env, inspector.userId,
        `🔮 كشف قيس السري: ${playerName(target)} — ${ROLE_NAMES[target.role]}.`);
    }
  }

  if (victim) {
    await sendMessage(env, room.chatId, `☠️ لم ينجُ ${playerName(victim)} من الليل.`);
  } else {
    await sendMessage(env, room.chatId, "🛡️ مرّت الليلة دون إقصاء.");
  }
  if (await checkAndFinish(env, room)) return;
  room.phase = "day";
  room.actions = { killVotes: {}, protect: null, inspect: null };
  room.votes = {};
  await saveRoom(env, room);
  await sendGameMoment(env, room.chatId,
    "☀️ بدأ النهار. ناقشوا ثم صوّتوا على اللاعب الذي تريدون إقصاءه. يمكن لكل لاعب تغيير صوته قبل اكتمال التصويت.",
    "day", { reply_markup: dayKeyboard(room) });
}

async function resolveDay(env, room, force = false) {
  const living = room.players.filter((player) => player.alive);
  if (!force && !living.every((player) => room.votes[player.userId])) return;
  const counts = new Map();
  for (const targetId of Object.values(room.votes)) {
    const target = room.players.find((player) => player.userId === String(targetId) && player.alive);
    if (target) counts.set(String(targetId), (counts.get(String(targetId)) || 0) + 1);
  }
  const highScore = Math.max(0, ...counts.values());
  const leaders = [...counts.entries()].filter((entry) => entry[1] === highScore && highScore > 0).map(([id]) => id);
  let eliminated = null;
  if (leaders.length === 1) {
    eliminated = room.players.find((player) => player.userId === leaders[0] && player.alive);
    if (eliminated) eliminated.alive = false;
  }
  await sendMessage(env, room.chatId, eliminated
    ? `⚖️ صوّتت القرية لإقصاء ${playerName(eliminated)}.`
    : "⚖️ انتهى التصويت بالتعادل؛ لم يُقصَ أحد.");
  if (await checkAndFinish(env, room)) return;
  await openNight(env, room);
}

async function handleCallback(env, query) {
  await answerCallback(env, query.id, "تم استلام اختيارك");
  const parts = String(query.data || "").split(":");
  const kind = parts[0];
  const chatId = parts[1];
  const room = await getRoom(env, chatId);
  if (!room) return;
  const actorId = String(query.from.id);
  const actor = room.players.find((player) => player.userId === actorId && player.alive);
  if (!actor) return;

  if (kind === "n") {
    const action = parts[2];
    const targetId = String(parts[3] || "");
    const target = room.players.find((player) => player.userId === targetId && player.alive);
    if (room.phase !== "night" || !target || target.userId === actorId) return;
    if (action === "kill") {
      if (actor.role !== "wolf" || target.role === "wolf") return;
      room.actions.killVotes[actorId] = targetId;
    } else if (action === "protect") {
      if (actor.role !== "doctor") return;
      room.actions.protect = { actorId, targetId };
    } else if (action === "inspect") {
      if (actor.role !== "qais") return;
      room.actions.inspect = { actorId, targetId };
    } else {
      return;
    }
    await saveRoom(env, room);
    await resolveNight(env, room);
    return;
  }

  if (kind === "d") {
    const targetId = String(parts[2] || "");
    const target = room.players.find((player) => player.userId === targetId && player.alive);
    if (room.phase !== "day" || !target) return;
    room.votes[actorId] = targetId;
    await saveRoom(env, room);
    const voted = Object.keys(room.votes).length;
    const aliveCount = room.players.filter((player) => player.alive).length;
    await sendMessage(env, room.chatId, `🗳️ تسجيل صوت جديد: ${voted}/${aliveCount}.`);
    await resolveDay(env, room);
  }
}

async function handleGroupCommand(env, message, command) {
  const chatId = String(message.chat.id);
  const userId = String(message.from.id);
  const firstName = message.from.first_name || "Player";
  const username = message.from.username || null;
  const privateStartKeyboard = {
    inline_keyboard: [[{
      text: "Start",
      url: "https://t.me/weirdoqaisbot",
    }]],
  };

  if (command === "help" || command === "start") {
    await sendMessage(env, chatId,
      "🐺 WeirdWolf — لعبة المستذئبين\n\n/newgame — إنشاء غرفة\n/join — الانضمام للغرفة\n/leave — مغادرة اللوبي\n/begin — بدء اللعبة (منشئ الغرفة فقط)\n/players — عرض اللاعبين\n/endday — إنهاء التصويت مبكرًا (منشئ الغرفة)\n/cancel — إلغاء الجولة (منشئ الغرفة)\n\nاضغط الزر أدناه لفتح البوت في الخاص وتفعيل استقبال دورك السري.",
      { reply_markup: privateStartKeyboard });
    return;
  }

  if (command === "newgame") {
    const current = await getRoom(env, chatId);
    if (current && current.phase !== "finished") {
      await sendMessage(env, chatId, "توجد جولة جارية بالفعل. استخدم /players أو انتظر نهايتها.");
      return;
    }
    const room = {
      chatId,
      title: message.chat.title || "WeirdWolf room",
      hostId: userId,
      hostName: firstName,
      phase: "lobby",
      round: 0,
      players: [],
      actions: { killVotes: {}, protect: null, inspect: null },
      votes: {},
      createdAt: Date.now(),
    };
    await saveRoom(env, room);
    await sendMessage(env, chatId,
      `🐺 WeirdWolf — غرفة جديدة\nأنشأها: ${firstName}\n\nاكتب /join للانضمام. تحتاج الجولة إلى 4 لاعبين على الأقل. لا تنسوا فتح البوت الخاص والضغط على Start أولًا.`);
    return;
  }

  const room = await getRoom(env, chatId);
  if (!room) {
    await sendMessage(env, chatId, "لا توجد غرفة بعد. ابدأ باستخدام /newgame.");
    return;
  }

  if (command === "join") {
    if (room.phase !== "lobby") {
      await sendMessage(env, chatId, "لا يمكن الانضمام بعد بدء الجولة.");
      return;
    }
    if (!await hasStarted(env, userId)) {
      await sendMessage(env, chatId,
        "قبل الانضمام، افتح البوت في الخاص واضغط Start مرة واحدة حتى أستطيع إرسال دورك السري. اضغط الزر أدناه للانتقال مباشرةً إلى البوت.",
        { reply_markup: privateStartKeyboard });
      return;
    }
    if (room.players.some((player) => player.userId === userId)) {
      await sendMessage(env, chatId, "أنت منضم بالفعل.");
      return;
    }
    room.players.push({ userId, firstName, username, alive: true, role: null });
    await saveRoom(env, room);
    await sendMessage(env, chatId, `انضم ${firstName} إلى الغرفة (${room.players.length} لاعبًا).`);
    return;
  }

  if (command === "leave") {
    if (room.phase !== "lobby") return sendMessage(env, chatId, "لا يمكنك المغادرة بعد بدء الجولة.");
    room.players = room.players.filter((player) => player.userId !== userId);
    await saveRoom(env, room);
    await sendMessage(env, chatId, "تم تحديث قائمة اللاعبين.");
    return;
  }

  if (command === "players") {
    const players = room.players.map((player, i) =>
      `${i + 1}. ${playerName(player)}${player.alive ? "" : " — مُقصى"}`);
    await sendMessage(env, chatId, `اللاعبون (${room.players.length}):\n${players.length ? players.join("\n") : "لا يوجد لاعبون بعد."}`);
    return;
  }

  if (command === "begin") {
    if (room.hostId !== userId) return sendMessage(env, chatId, "بدء الجولة متاح لمنشئ الغرفة فقط.");
    if (room.phase !== "lobby") return sendMessage(env, chatId, "الجولة ليست في مرحلة اللوبي.");
    if (room.players.length < 4) return sendMessage(env, chatId, "تحتاج إلى 4 لاعبين على الأقل لبدء اللعبة.");
    await startGame(env, room);
    return;
  }

  if (command === "endday") {
    if (room.hostId !== userId) return sendMessage(env, chatId, "هذا الأمر متاح لمنشئ الغرفة فقط.");
    if (room.phase !== "day") return sendMessage(env, chatId, "لا يوجد تصويت نهاري جارٍ.");
    await resolveDay(env, room, true);
    return;
  }

  if (command === "cancel" || command === "end" || command === "endgame") {
    const isDeveloper = userId === "1864964070";
    if (room.hostId !== userId && !isDeveloper) {
      return sendMessage(env, chatId, "إلغاء الجولة متاح لمنشئ الغرفة أو مطور البوت فقط.");
    }
    room.phase = "finished";
    await saveRoom(env, room);
    await sendMessage(env, chatId, isDeveloper && room.hostId !== userId
      ? "🛠️ ألغى مطور WeirdWolf الجولة. اكتب /newgame لبدء جولة جديدة."
      : "🐺 انتهت الجولة الحالية بواسطة منشئ الغرفة. اكتب /newgame لبدء جولة جديدة.");
  }
}

async function handleUpdate(env, update) {
  if (update.callback_query) {
    await handleCallback(env, update.callback_query);
    return;
  }
  const message = update.message;
  if (!message || !message.from || message.from.is_bot) return;
  const command = commandOf(message);
  if (!command) return;

  if (message.chat.type === "private") {
    if (command === "start" || command === "help") {
      await markStarted(env, message.from);
      await sendMessage(env, message.chat.id,
        "مرحبًا بك في WeirdWolf. تم تفعيل الرسائل الخاصة حتى يصل إليك دورك في اللعبة.\n\nأضف البوت إلى مجموعة، ثم استخدم /newgame و/join. اكتب /help في المجموعة لعرض الأوامر.");
    }
    return;
  }
  if (chatIsGroup(message.chat)) {
    await handleGroupCommand(env, message, command);
  }
}

function setupPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WeirdWolf setup</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f1f3f8;font:16px/1.6 system-ui,sans-serif}.card{width:min(560px,92vw);padding:30px;border:1px solid #303544;border-radius:20px;background:#151a24}h1{margin-top:0}p{color:#b9c0ce}label{display:block;margin:20px 0 8px}input{width:100%;padding:13px;border:1px solid #454b5a;border-radius:10px;background:#0b0d12;color:white}button{margin-top:18px;padding:12px 16px;border:0;border-radius:10px;background:#f4bd69;color:#171717;font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b9e8c9}</style></head><body><main class="card"><h1>WeirdWolf setup</h1><p>This one-time step registers this Worker as your Telegram bot webhook. Your bot token stays in Cloudflare Secrets and is never entered here.</p><form id="form"><label for="key">Setup key</label><input id="key" type="password" autocomplete="current-password" required><button type="submit">Register webhook</button></form><pre id="result" aria-live="polite"></pre><p><a href="/">Back to status page</a></p></main><script>document.getElementById("form").addEventListener("submit",async function(event){event.preventDefault();const result=document.getElementById("result");const button=event.target.querySelector("button");button.disabled=true;result.textContent="Registering…";try{const response=await fetch("/setup-webhook",{method:"POST",headers:{"Authorization":"Bearer "+document.getElementById("key").value,"Content-Type":"application/json"},body:"{}"});const data=await response.json();result.textContent=data.ok?"Success: "+(data.description||"Webhook registered."):( "Error: "+(data.error||data.description||"Setup failed."));}catch(error){result.textContent="Request failed. Check the Worker deployment and try again.";}finally{button.disabled=false;}});</script></body></html>`;
}

function htmlPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WeirdWolf</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f1f3f8;font:16px/1.6 system-ui,sans-serif}.card{width:min(720px,92vw);padding:36px;border:1px solid #303544;border-radius:24px;background:linear-gradient(145deg,#171b26,#10131b);box-shadow:0 24px 80px #0006}span{color:#f4bd69;letter-spacing:.16em;text-transform:uppercase;font-size:.78rem}h1{font-size:clamp(2.2rem,7vw,4rem);line-height:1.05;margin:.5rem 0 1rem}p{color:#c2c7d4}.status{display:inline-flex;align-items:center;gap:8px;border:1px solid #285b42;border-radius:99px;padding:6px 12px;color:#9ae2b4;font-size:.9rem}.dot{width:8px;height:8px;border-radius:50%;background:#62d994}footer{margin-top:32px;padding-top:18px;border-top:1px solid #303544;color:#858da0;font-size:.85rem}</style></head><body><main class="card"><span>Werewolf · Community game</span><h1>WeirdWolf</h1><p>A Telegram group game maintained by Qais (Weirdo), with a web-native deployment edition.</p><p class="status"><i class="dot"></i> Worker online</p><p><strong>Featured role:</strong> Qais, Keeper of Secrets — a unique oracle who privately investigates one player each night.</p><p>To play, open the bot on Telegram, press Start, add it to a group, and use <code>/newgame</code>.</p><footer>Independent fork. Original Werewolf project attribution and GPL-3.0 terms remain applicable.</footer></main></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(htmlPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "WeirdWolf", runtime: "Cloudflare Workers" });
    }
    if (request.method === "GET" && url.pathname === "/setup") {
      return new Response(setupPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (request.method === "POST" && url.pathname === "/setup-webhook") {
      if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET || !env.SETUP_KEY) {
        return Response.json({ ok: false, error: "Missing required Cloudflare secrets." }, { status: 503 });
      }
      if (request.headers.get("Authorization") !== `Bearer ${env.SETUP_KEY}`) {
        return Response.json({ ok: false, error: "Incorrect setup key." }, { status: 403 });
      }
      const setup = await telegram(env, "setWebhook", {
        url: `${url.origin}/telegram/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      });
      return Response.json(
        { ok: Boolean(setup.ok), description: setup.ok ? "Webhook registered." : (setup.description || "Telegram rejected the request.") },
        { status: setup.ok ? 200 : 502 },
      );
    }
    if (url.pathname !== "/telegram/webhook" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (!env.BOT_TOKEN || !env.DB || !env.WEBHOOK_SECRET) {
      return new Response("Service is not configured", { status: 503 });
    }
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const update = await request.json();
      await handleUpdate(env, update);
      return new Response("ok");
    } catch (error) {
      console.error("Update handling failed:", error?.message || String(error));
      return new Response("Temporary error", { status: 500 });
    }
  },
};

export { handleUpdate };
