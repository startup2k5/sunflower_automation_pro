(function () {
	"use strict";

	const BRIDGE_SOURCE = "SFL_HELPER_BRIDGE";
	const MAX_DEPTH = 5;
	const AUTOSAVE_ALERT_COOLDOWN_MS = 5000;
	let lastAutosaveAlertAt = 0;
	const TRACKED_ITEMS = [
		"Sunflower Seed",
		"Carrot Seed",
		"Cabbage Seed",
		"Potato Seed",
		"Radish Seed",
		"Pumpkin Seed",
		"Parsnip Seed",
		"Wheat Seed",
		"Axe",
		"Stone Axe",
		"Iron Axe",
		"Gold Axe",
		"Pickaxe",
		"Stone Pickaxe",
		"Iron Pickaxe",
		"Gold Pickaxe",
		"Oil Drill",
	];

	let gameService = null;

	function pickTrackedInventory(gameLike) {
		const inventory = gameLike?.inventory;
		if (!inventory || typeof inventory !== "object") return {};

		const tracked = {};
		for (const name of TRACKED_ITEMS) {
			const value = toNumber(inventory[name]);
			if (value !== undefined) {
				tracked[name] = value;
			}
		}

		// Capture any extra tool variants not explicitly listed above.
		for (const [name, rawValue] of Object.entries(inventory)) {
			if (!/axe|pickaxe|drill/i.test(name)) continue;
			const value = toNumber(rawValue);
			if (value !== undefined) {
				tracked[name] = value;
			}
		}

		return tracked;
	}

	function toNumber(value) {
		if (value === null || value === undefined || value === "") return undefined;

		if (typeof value === "number") {
			return Number.isFinite(value) ? value : undefined;
		}

		if (typeof value === "string") {
			const parsed = Number(value.replace(/,/g, "").trim());
			return Number.isFinite(parsed) ? parsed : undefined;
		}

		if (typeof value === "object") {
			if (typeof value.toNumber === "function") {
				const parsed = Number(value.toNumber());
				return Number.isFinite(parsed) ? parsed : undefined;
			}

			if (typeof value.toString === "function") {
				const parsed = Number(String(value));
				return Number.isFinite(parsed) ? parsed : undefined;
			}
		}

		return undefined;
	}

	function pickUserInfo(gameLike) {
		if (!gameLike || typeof gameLike !== "object") return null;

		const gems = toNumber(gameLike?.inventory?.Gem);
		const payload = {
			username:
				typeof gameLike.username === "string" && gameLike.username.trim()
					? gameLike.username.trim()
					: undefined,
			coins: toNumber(gameLike.coins),
			gems,
			flower: toNumber(gameLike.balance),
			season: gameLike?.season?.season,
			inventory: pickTrackedInventory(gameLike),
			farmActivity:
				gameLike?.farmActivity && typeof gameLike.farmActivity === "object"
					? gameLike.farmActivity
					: undefined,
		};

		if (
			payload.username === undefined &&
			payload.coins === undefined &&
			payload.gems === undefined &&
			payload.flower === undefined
		) {
			return null;
		}

		return payload;
	}

	function isGameLikeObject(value) {
		if (!value || typeof value !== "object") return false;
		return "inventory" in value && "coins" in value && "balance" in value;
	}

	function isGameService(obj) {
		if (!obj || typeof obj !== "object") return false;
		if (typeof obj.getSnapshot !== "function" || typeof obj.send !== "function") {
			return false;
		}

		try {
			const snap = obj.getSnapshot();
			const ctx = snap?.context || snap?.value?.context || {};
			const state = ctx.state || ctx.gameState || ctx;
			return !!(state && (state.inventory || state.trees || state.crops));
		} catch (error) {
			return false;
		}
	}

	function extractService(input) {
		if (!input || typeof input !== "object") return null;
		if (isGameService(input)) return input;

		try {
			for (const key of Object.keys(input)) {
				if (key.startsWith("__")) continue;
				const value = input[key];
				if (isGameService(value)) return value;
				if (!value || typeof value !== "object") continue;
				for (const sub of Object.keys(value)) {
					if (sub.startsWith("__")) continue;
					if (isGameService(value[sub])) return value[sub];
				}
			}
		} catch (error) {
			return null;
		}

		return null;
	}

	function findGameService() {
		if (gameService && isGameService(gameService)) {
			return gameService;
		}

		gameService = null;
		const elements = document.querySelectorAll("*");

		for (const el of elements) {
			const fiberKey = Object.keys(el).find((key) => key.startsWith("__reactFiber"));
			if (!fiberKey) continue;

			const queue = [el[fiberKey]];
			const visited = new Set();

			while (queue.length) {
				const node = queue.shift();
				if (!node || visited.has(node)) continue;
				visited.add(node);

				const found = extractService(node.memoizedProps) || extractService(node.memoizedState);
				if (found) {
					gameService = found;
					return gameService;
				}

				if (node.child) queue.push(node.child);
				if (node.sibling) queue.push(node.sibling);
			}
		}

		return null;
	}

	function findGameLikeObject(input) {
		const queue = [{ value: input, depth: 0 }];
		const seen = new WeakSet();

		while (queue.length) {
			const { value, depth } = queue.shift();
			if (!value || typeof value !== "object") continue;
			if (seen.has(value)) continue;
			seen.add(value);

			if (isGameLikeObject(value)) {
				return value;
			}

			if (depth >= MAX_DEPTH) continue;

			if (Array.isArray(value)) {
				for (const child of value) {
					queue.push({ value: child, depth: depth + 1 });
				}
			} else {
				for (const child of Object.values(value)) {
					queue.push({ value: child, depth: depth + 1 });
				}
			}
		}

		return null;
	}

	function emitSnapshot(snapshot) {
		if (!snapshot) return;
		window.postMessage(
			{
				source: BRIDGE_SOURCE,
				type: "SFL_GAME_SNAPSHOT",
				payload: snapshot,
			},
			"*",
		);
	}

	function inspectPayload(payload) {
		const gameLike = findGameLikeObject(payload);
		if (!gameLike) return;

		const snapshot = pickUserInfo(gameLike);
		emitSnapshot(snapshot);
	}

	function toSafeNumber(value) {
		try {
			if (typeof value === "number") return value;
			if (typeof value?.toNumber === "function") return value.toNumber();
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		} catch (error) {
			return 0;
		}
	}

	function serializeInventory(inv) {
		const result = {};
		for (const [key, value] of Object.entries(inv || {})) {
			result[key] = toSafeNumber(value);
		}
		return result;
	}

	function serializeFarmActivity(activity) {
		const result = {};
		for (const [key, value] of Object.entries(activity || {})) {
			result[key] = toSafeNumber(value);
		}
		return result;
	}

	function toNodes(mapLike, read) {
		return Object.entries(mapLike || {}).map(([id, value]) => read(String(id), value || {}));
	}

	function toList(mapLike, read) {
		return Object.entries(mapLike || {}).map(([id, value]) => read(String(id), value || {}));
	}

	function resolveMachineStateName(snapshot) {
		if (!snapshot) return "unknown";

		const value = snapshot.value;
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}

		if (value && typeof value === "object") {
			const keys = Object.keys(value);
			if (keys.length > 0) {
				return String(keys[0] || "unknown");
			}
		}

		return "unknown";
	}

	function isMachineStateBlocked(stateName) {
		return [
			"loading",
			"refreshing",
			"autosaving",
			"hoarding",
			"swarming",
			"coolingDown",
			"randomising",
			"notifying",
			"error",
		].includes(String(stateName || "").trim());
	}

	function isServiceBusyForAutomation(snapshot) {
		const stateName = resolveMachineStateName(snapshot);
		const ctx = snapshot?.context || snapshot?.value?.context || {};
		const pendingActions = Array.isArray(ctx?.actions) ? ctx.actions.length : 0;
		const saveQueued = !!ctx?.saveQueued;
		const blockedByQueue = pendingActions > 0 || saveQueued;

		let blockedReason = "";
		if (blockedByQueue) {
			blockedReason = saveQueued ? "save_queued" : "pending_actions";
		} else if (isMachineStateBlocked(stateName)) {
			blockedReason = stateName || "busy";
		}

		return {
			stateName,
			pendingActions,
			saveQueued,
			blockedReason,
			blocked: isMachineStateBlocked(stateName) || blockedByQueue,
			ready: stateName === "playing" && !blockedByQueue,
		};
	}

	/**
	 * Detect active destructive weather event (tornado, tsunami, greatFreeze).
	 * Mirrors game logic: event is active if calendar.<event>.startedAt is within last 24h.
	 */
	function getActiveDestructiveWeather(calendar) {
		if (!calendar || typeof calendar !== "object") return null;
		const DAY_MS = 24 * 60 * 60 * 1000;
		const now = Date.now();
		const destructiveEvents = ["tornado", "tsunami", "greatFreeze"];
		for (let i = 0; i < destructiveEvents.length; i++) {
			const name = destructiveEvents[i];
			const ev = calendar[name];
			if (ev && ev.startedAt) {
				const startMs = new Date(ev.startedAt).getTime();
				if (Number.isFinite(startMs) && startMs > now - DAY_MS) {
					const isProtected = !!ev.protected;
					return { name, startedAt: startMs, protected: isProtected };
				}
			}
		}
		return null;
	}

	/**
	 * Which plot IDs are "destroyed" by weather — first half of plots sorted by createdAt (oldest first).
	 * Mirrors isCropDestroyed() from game source: crops.slice(0, floor(len/2)).
	 */
	function getDestroyedPlotIds(cropsMap) {
		if (!cropsMap || typeof cropsMap !== "object") return new Set();
		const entries = Object.entries(cropsMap);
		if (entries.length === 0) return new Set();
		// Sort oldest createdAt first (ascending) — same as game logic
		entries.sort((a, b) => {
			const caA = toSafeNumber(a[1]?.createdAt);
			const caB = toSafeNumber(b[1]?.createdAt);
			return caA - caB;
		});
		const destroyCount = Math.floor(entries.length / 2);
		const destroyed = new Set();
		for (let i = 0; i < destroyCount; i++) {
			destroyed.add(entries[i][0]);
		}
		return destroyed;
	}

	/**
	 * Determine which crop plot IDs are infertile (not enough water wells).
	 * Mirrors game's isPlotFertile + getSupportedPlots logic:
	 * - Basic island: first 17 plots free; other islands: first 18
	 * - Each Water Well adds 8 plots; well level 4+ = unlimited (99)
	 * - Plots sorted by createdAt ascending; position > supported = infertile
	 */
	function getInfertilePlotIds(state) {
		if (!state || !state.crops || typeof state.crops !== "object") return new Set();

		const islandType = state?.island?.type || "basic";
		const initialPlots = islandType !== "basic" ? 18 : 17;
		const WELL_PLOT_SUPPORT = 8;

		// Water well level & upgrade state
		let wellLevel = toSafeNumber(state?.waterWell?.level) || 0;
		const upgradeReadyAt = toSafeNumber(state?.waterWell?.upgradeReadyAt) || 0;
		const nowMs = Date.now();
		if (upgradeReadyAt && upgradeReadyAt > nowMs) {
			wellLevel = Math.max(0, wellLevel - 1);
		}

		// Check if at least one Water Well building is placed on the farm
		const wellBuildings = state?.buildings?.["Water Well"];
		const hasPlacedWell = Array.isArray(wellBuildings) &&
			wellBuildings.some((w) => w && w.coordinates);

		let supportedPlots;
		if (!hasPlacedWell) {
			supportedPlots = initialPlots;
		} else if (wellLevel >= 4) {
			supportedPlots = 99; // unlimited
		} else {
			supportedPlots = wellLevel * WELL_PLOT_SUPPORT + initialPlots;
		}

		// Sort all plots by createdAt ascending (same as game logic)
		const allPlots = Object.entries(state.crops);
		const placed = allPlots.filter(([, plot]) =>
			plot && plot.x !== undefined && plot.y !== undefined
		);
		placed.sort((a, b) => {
			const caA = toSafeNumber(a[1]?.createdAt);
			const caB = toSafeNumber(b[1]?.createdAt);
			return caA - caB;
		});

		const infertile = new Set();
		for (let i = supportedPlots; i < placed.length; i++) {
			infertile.add(placed[i][0]);
		}
		return infertile;
	}

	function buildStatePayload() {
		const svc = findGameService();
		if (!svc) return null;

		const snap = svc.getSnapshot();
		const machine = isServiceBusyForAutomation(snap);
		const ctx = snap?.context || snap?.value?.context || {};
		const state = ctx.state || ctx.gameState || ctx;

	// ── Weather detection ──
		const activeWeather = getActiveDestructiveWeather(state.calendar);
		let weatherBlockedPlots = new Set();
		if (activeWeather && !activeWeather.protected) {
			weatherBlockedPlots = getDestroyedPlotIds(state.crops);
		}

		// ── Water Well / Fertility check ──
		// Plots beyond what the water well supports are infertile (disappeared/locked).
		// Mirrors game's isPlotFertile: first 17-18 free, each well level adds 8, level 4+ = unlimited.
		const infertilePlots = getInfertilePlotIds(state);

		const emptyCropPlots = Object.entries(state.crops || {})
			.map(([plotKey, plot]) => {
				const plantedAt = toSafeNumber(plot?.crop?.plantedAt ?? plot?.plantedAt);
				const cropName = String(plot?.crop?.name || "").trim();
				const empty = !cropName && plantedAt <= 0;
				if (!empty) return null;
				// Skip plots destroyed by active weather event (tornado/tsunami/freeze)
				if (weatherBlockedPlots.has(plotKey)) return null;
				// Skip infertile plots (no water well / not enough wells)
				if (infertilePlots.has(plotKey)) return null;
				return {
					plotKey: String(plotKey),
					x: toSafeNumber(plot?.x),
					y: toSafeNumber(plot?.y),
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.y - b.y || a.x - b.x || String(a.plotKey).localeCompare(String(b.plotKey)));

		return {
			emptyCropPlots,
			trees: toNodes(state.trees, (id, t) => ({
				id,
				choppedAt: toSafeNumber(t?.wood?.choppedAt ?? t?.choppedAt),
			})),
			mushrooms: toNodes(state?.mushrooms?.mushrooms, (id, m) => ({
				id,
				name: String(m?.name || ""),
				x: toSafeNumber(m?.x),
				y: toSafeNumber(m?.y),
			})),
			crops: toList(state.crops, (id, crop) => ({
				id: String(crop?.id ?? id),
				resourceType: "crop_plot",
				plotKey: String(id),
				x: toSafeNumber(crop?.x),
				y: toSafeNumber(crop?.y),
				plantedAt: toSafeNumber(
					crop?.plantedAt ??
					crop?.crop?.plantedAt ??
					crop?.crop?.planted_at,
				),
				readyAt: toSafeNumber(
					crop?.readyAt ??
					crop?.crop?.readyAt ??
					crop?.crop?.ready_at,
				),
				cropName: String(
					crop?.cropName ||
					crop?.crop?.name ||
					crop?.name ||
					"",
				),
				boostedTime: toSafeNumber(
					crop?.boostedTime ??
					crop?.crop?.boostedTime ??
					crop?.crop?.boosted_time,
				),
				fertiliserName: String(crop?.fertiliser?.name || ""),
				fertilisedAt: toSafeNumber(crop?.fertiliser?.fertilisedAt),
			})),
			fruitPatches: toList(state.fruitPatches, (id, patch) => ({
				id: String(patch?.id ?? id),
				resourceType: "fruit_patch",
				fruit: patch?.fruit
					? {
						name: String(patch.fruit.name || ""),
						plantedAt: toSafeNumber(patch.fruit.plantedAt),
						harvestedAt: toSafeNumber(patch.fruit.harvestedAt),
						harvestsLeft: toSafeNumber(patch.fruit.harvestsLeft),
					}
					: null,
			})),
			greenhousePots: toList(state?.greenhouse?.pots, (id, pot) => ({
				id: toSafeNumber(pot?.id ?? id),
				plant: pot?.plant
					? {
						name: String(pot.plant.name || ""),
						plantedAt: toSafeNumber(pot.plant.plantedAt),
					}
					: null,
			})),
			stones: toNodes(state.stones, (id, s) => ({
				id,
				minedAt: toSafeNumber(s?.stone?.minedAt ?? s?.minedAt),
				multiplier: toSafeNumber(s?.multiplier) || 1,
			})),
			ironRocks: toNodes(state.iron, (id, s) => ({
				id,
				minedAt: toSafeNumber(s?.stone?.minedAt ?? s?.minedAt),
				multiplier: toSafeNumber(s?.multiplier) || 1,
			})),
			goldRocks: toNodes(state.gold, (id, s) => ({
				id,
				minedAt: toSafeNumber(s?.stone?.minedAt ?? s?.minedAt),
				multiplier: toSafeNumber(s?.multiplier) || 1,
			})),
			crimstones: toNodes(state.crimstones, (id, s) => ({
				id,
				minedAt: toSafeNumber(s?.stone?.minedAt ?? s?.minedAt),
				multiplier: toSafeNumber(s?.multiplier) || 1,
			})),
			sunstones: toNodes(state.sunstones, (id, s) => ({
				id,
				minedAt: toSafeNumber(s?.stone?.minedAt ?? s?.minedAt),
				multiplier: toSafeNumber(s?.multiplier) || 1,
			})),
			inventory: serializeInventory(state.inventory),
			stock: serializeInventory(state.stock),
			bumpkinExperience: toSafeNumber(state?.bumpkin?.experience),
			buildings: (() => {
				// state.buildings có thể là object-map { name: [inst,...] } HOẶC { name: { id: inst } }
				// toList duyệt Object.entries(state.buildings) → (name, value)
				// value có thể là Array hoặc Object → cần normalize về array
				function toBuildingItemArray(list) {
					if (!list) return [];
					if (Array.isArray(list)) return list;
					// Object-map dạng { "123": { id, crafting, ... } }
					return Object.values(list);
				}
				return toList(state.buildings, (name, list) => ({
					name,
					items: toBuildingItemArray(list).map((b) => ({
						id: String(b.id || ""),
						readyAt: toSafeNumber(b.readyAt),
						craftingQueue: Array.isArray(b.crafting)
							? b.crafting.map((entry) => ({
									item: String(entry?.name || entry?.item || ""),
									readyAt: toSafeNumber(entry?.readyAt),
								}))
							: b.crafting
								? [{
										item: String(b.crafting?.name || b.crafting?.item || ""),
										readyAt: toSafeNumber(b.crafting?.readyAt),
								  }]
								: [],
					})),
				}));
			})(),
			oilReserves: Object.keys(state.oilReserves || {}),
			farmActivity: serializeFarmActivity(state.farmActivity),
			season: String(state?.season?.season || "spring"),
			coins: toSafeNumber(state.coins),
			balance: toSafeNumber(state.balance),
			machineState: machine.stateName,
			machineBusy: machine.blocked,
			machineReady: machine.ready,
			pendingActions: machine.pendingActions,
			saveQueued: machine.saveQueued,
			// Weather info for automation to skip blocked plots
			activeWeather: activeWeather ? {
				name: activeWeather.name,
				startedAt: activeWeather.startedAt,
				isProtected: activeWeather.protected,
				blockedPlotCount: weatherBlockedPlots.size,
			} : null,
		};
	}

	function stableSerialize(value) {
		if (value === null || value === undefined) return String(value);

		if (Array.isArray(value)) {
			return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
		}

		if (typeof value === "object") {
			const keys = Object.keys(value).sort();
			return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
		}

		return JSON.stringify(value);
	}

	function getStateSignature(payload) {
		return payload ? stableSerialize(payload) : "";
	}

	function delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function waitForSettledStateChange(previousSignature, timeoutMs = 1800) {
		const deadline = Date.now() + Math.max(200, timeoutMs);
		let latestPayload = null;
		let latestSignature = previousSignature || "";

		while (Date.now() < deadline) {
			await delay(120);
			latestPayload = buildStatePayload();
			latestSignature = getStateSignature(latestPayload);

			if (latestPayload && latestSignature !== previousSignature) {
				await delay(120);
				const settledPayload = buildStatePayload();
				const settledSignature = getStateSignature(settledPayload);

				return {
					payload: settledPayload || latestPayload,
					changed: settledSignature !== previousSignature || latestSignature !== previousSignature,
				};
			}
		}

		if (!latestPayload) {
			latestPayload = buildStatePayload();
			latestSignature = getStateSignature(latestPayload);
		}

		return {
			payload: latestPayload,
			changed: latestSignature !== previousSignature,
		};
	}

	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		const data = event.data;
		if (!data || data._sfl !== true) return;

		if (data.type === "SFL_GET_STATE") {
			try {
				const payload = buildStatePayload();
				if (!payload) {
					window.postMessage({ _sfl: true, type: "SFL_STATE", error: "no_service" }, "*");
					return;
				}

				window.postMessage({ _sfl: true, type: "SFL_STATE", data: payload }, "*");
			} catch (error) {
				window.postMessage(
					{ _sfl: true, type: "SFL_STATE", error: error?.message || "state_error" },
					"*",
				);
			}
			return;
		}

		if (data.type === "SFL_SEND_EVENT") {
			const svc = findGameService();
			const reqId = data?.reqId;
			const eventType = data?.event?.type || "unknown_event";

			if (!svc) {
				window.postMessage(
					{ _sfl: true, type: "SFL_EVENT_RESULT", ok: false, reqId, eventType, error: "no_service" },
					"*",
				);
				return;
			}

			(async () => {
				try {
					const initialSnapshot = svc.getSnapshot();
					const machine = isServiceBusyForAutomation(initialSnapshot);
					if (!machine.ready || machine.blocked) {
						const busyReason = machine.blockedReason || machine.stateName || "busy";
						window.postMessage(
							{
								_sfl: true,
								type: "SFL_EVENT_RESULT",
								ok: false,
								reqId,
								eventType,
								error: `service_busy:${busyReason}`,
								state: buildStatePayload(),
								stateChanged: false,
							},
							"*",
						);
						return;
					}

					const beforePayload = buildStatePayload();
					const beforeSignature = getStateSignature(beforePayload);
					const sendResult = await Promise.resolve(svc.send(data.event));
					let ok = true;
					let error = undefined;

					if (sendResult && typeof sendResult.matches === "function") {
						if (sendResult.matches("hoarding")) {
							ok = false;
							error = "restock";
						}
					}

					const settled = await waitForSettledStateChange(beforeSignature, ok ? 1800 : 900);

					window.postMessage(
						{
							_sfl: true,
							type: "SFL_EVENT_RESULT",
							ok,
							reqId,
							eventType,
							error,
							state: settled.payload || beforePayload || null,
							stateChanged: !!settled.changed,
						},
						"*",
					);
				} catch (error) {
					window.postMessage(
						{
							_sfl: true,
							type: "SFL_EVENT_RESULT",
							ok: false,
							reqId,
							eventType,
							error: error?.message || "send_event_error",
						},
						"*",
					);
				}
			})();
			return;
		}
	});

	function resolveFetchUrl(args, response) {
		if (response?.url) return String(response.url);

		const firstArg = args?.[0];
		if (typeof firstArg === "string") return firstArg;
		if (firstArg && typeof firstArg === "object" && typeof firstArg.url === "string") {
			return firstArg.url;
		}

		return "";
	}

	function resolveFetchMethod(args) {
		const firstArg = args?.[0];
		const secondArg = args?.[1];

		if (secondArg && typeof secondArg === "object" && typeof secondArg.method === "string") {
			return secondArg.method.toUpperCase();
		}

		if (firstArg && typeof firstArg === "object" && typeof firstArg.method === "string") {
			return firstArg.method.toUpperCase();
		}

		return "GET";
	}

	function normalizeHeaderMap(headersLike) {
		const map = {};
		if (!headersLike) return map;

		try {
			if (typeof headersLike.forEach === "function") {
				headersLike.forEach((value, key) => {
					map[String(key).toLowerCase()] = String(value);
				});
				return map;
			}

			if (Array.isArray(headersLike)) {
				for (const [key, value] of headersLike) {
					map[String(key).toLowerCase()] = String(value);
				}
				return map;
			}

			if (typeof headersLike === "object") {
				for (const [key, value] of Object.entries(headersLike)) {
					map[String(key).toLowerCase()] = String(value);
				}
			}
		} catch (error) {
			// Ignore header parsing failures.
		}

		return map;
	}

	function resolveRequestHeaders(args) {
		const firstArg = args?.[0];
		const secondArg = args?.[1];

		if (secondArg && typeof secondArg === "object") {
			const headers = normalizeHeaderMap(secondArg.headers);
			if (Object.keys(headers).length > 0) return headers;
		}

		if (firstArg && typeof firstArg === "object") {
			const headers = normalizeHeaderMap(firstArg.headers);
			if (Object.keys(headers).length > 0) return headers;
		}

		return {};
	}

	function parseAutosaveErrorDetailFromText(text) {
		if (!text || typeof text !== "string") return null;
		try {
			const parsed = JSON.parse(text);
			if (parsed && typeof parsed === "object") {
				return {
					message: typeof parsed.message === "string" ? parsed.message : null,
					errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : null,
					code: typeof parsed.code === "string" ? parsed.code : null,
				};
			}
		} catch (error) {
			// Not JSON, keep raw snippet only.
		}

		return null;
	}

	async function maybeEmitAutosaveAlert(args, response, fetchError) {
		const now = Date.now();
		if (now - lastAutosaveAlertAt < AUTOSAVE_ALERT_COOLDOWN_MS) return;

		const url = resolveFetchUrl(args, response).toLowerCase();
		const method = resolveFetchMethod(args);
		if (method !== "POST" || !/\/autosave\//.test(url)) return;

		if (fetchError || !response || !response.ok) {
			const requestHeaders = resolveRequestHeaders(args);
			let responseSnippet = null;
			let parsedResponseDetail = null;
			let responseHeaders = {};

			if (response) {
				try {
					responseHeaders = normalizeHeaderMap(response.headers);
				} catch (error) {
					responseHeaders = {};
				}

				try {
					const text = await response.clone().text();
					if (text) {
						responseSnippet = text.slice(0, 600);
						parsedResponseDetail = parseAutosaveErrorDetailFromText(text);
					}
				} catch (error) {
					responseSnippet = null;
				}
			}

			lastAutosaveAlertAt = now;
			window.postMessage(
				{
					_sfl: true,
					type: "SFL_NETWORK_ALERT",
					kind: "autosave",
					status: response?.status || 0,
					statusText: response?.statusText || "",
					url,
					error: fetchError?.message || null,
					requestTransactionId: requestHeaders["x-transaction-id"] || null,
					requestFingerprint: requestHeaders["x-fingerprint"] || null,
					responseRequestId:
						responseHeaders["x-request-id"] ||
						responseHeaders["x-amzn-requestid"] ||
						responseHeaders["cf-ray"] ||
						null,
					responseErrorCode:
						parsedResponseDetail?.errorCode ||
						parsedResponseDetail?.code ||
						null,
					responseMessage: parsedResponseDetail?.message || null,
					responseSnippet,
				},
				"*",
			);
		}
	}

	function shouldInspectResponse(args, response) {
		if (!response || !response.ok) return false;

		const url = resolveFetchUrl(args, response).toLowerCase();
		if (url && (/type=leagues/.test(url) || /leaderboard/.test(url))) {
			return false;
		}

		const contentType = response.headers.get("content-type") || "";
		return /application\/json/i.test(contentType);
	}

	const originalFetch = window.fetch;
	window.fetch = async function (...args) {
		let response;
		try {
			response = await originalFetch.apply(this, args);
		} catch (error) {
			await maybeEmitAutosaveAlert(args, null, error);
			throw error;
		}

		await maybeEmitAutosaveAlert(args, response, null);

		try {
			if (!shouldInspectResponse(args, response)) {
				return response;
			}

			const clone = response.clone();
			clone
				.json()
				.then((json) => inspectPayload(json))
				.catch(() => {
					// Ignore parse failures from non-JSON or malformed bodies.
				});
		} catch (error) {
			// Ignore bridge-level inspection failures.
		}

		return response;
	};


	// ═══════ Captcha Grid Reader (MAIN world → can access __reactFiber) ═══════
	// Content script (Isolated world) KHÔNG thể đọc __reactFiber trên DOM elements.
	// Handler này chạy trong MAIN world, đọc fiber tree → tìm mảng items[16] của StopTheGoblins.

	/** Chuẩn hóa cờ target: isGoblin / isMoonSeeker / isZombie / isSkeleton → isGoblin chung. */
	function _normalizeIsTarget(item) {
		if (!item || typeof item !== "object") return false;
		if (item.isGoblin === true) return true;
		if (item.isMoonSeeker === true) return true;
		if (item.isZombie === true) return true;
		if (item.isSkeleton === true) return true;
		return false;
	}

	/** Kiểm tra phần tử đầu tiên có phải item captcha grid hay không (bất kỳ type). */
	function _isCaptchaGridItem(first) {
		if (!first || typeof first !== "object") return false;
		if (typeof first.isGoblin === "boolean") return true;
		if (typeof first.isMoonSeeker === "boolean") return true;
		if (typeof first.isZombie === "boolean") return true;
		if (typeof first.isSkeleton === "boolean") return true;
		return false;
	}

	/** Map mảng 16 items thành dạng nhẹ: { index, isGoblin, src }. */
	function _mapCaptchaGridItems(st) {
		return st.map((item, idx) => ({
			index: idx,
			isGoblin: _normalizeIsTarget(item),
			src: typeof item.src === "string" ? item.src.slice(0, 120) : "",
		}));
	}

	/** Tìm mảng 16 items trong hook chain của một fiber node. */
	function _findGrid16InFiber(f) {
		let hook = f.memoizedState;
		for (let hi = 0; hi < 60 && hook; hi += 1) {
			const st = hook.memoizedState;
			if (Array.isArray(st) && st.length === 16 && _isCaptchaGridItem(st[0])) {
				return _mapCaptchaGridItems(st);
			}
			// Đôi khi state được gói trong object
			if (st && typeof st === "object" && !Array.isArray(st)) {
				try {
					const keys = Object.keys(st);
					for (let ki = 0; ki < keys.length; ki += 1) {
						const val = st[keys[ki]];
						if (Array.isArray(val) && val.length === 16 && _isCaptchaGridItem(val[0])) {
							return _mapCaptchaGridItems(val);
						}
					}
				} catch (_e) { /* ignore */ }
			}
			hook = hook.next;
		}
		return null;
	}

	function _readCaptchaGridItems() {
		// Tìm grid wrapper — quét TẤT CẢ dialog + overlay, không chỉ dialog đầu tiên
		const candidates = [];

		// Tất cả [role="dialog"]
		try {
			const dialogs = document.querySelectorAll('[role="dialog"]');
			for (let i = 0; i < dialogs.length; i += 1) candidates.push(dialogs[i]);
		} catch (_e) { /* ignore */ }

		// Overlay / container có flex-wrap grid
		try {
			const wraps = document.querySelectorAll("div.flex.flex-wrap.justify-center.items-center");
			for (let wi = 0; wi < wraps.length; wi += 1) {
				let anc = wraps[wi].parentElement;
				for (let up = 0; up < 12 && anc; up += 1) {
					if (!candidates.includes(anc)) candidates.push(anc);
					anc = anc.parentElement;
				}
			}
		} catch (_e) { /* ignore */ }

		for (let ci = 0; ci < candidates.length; ci += 1) {
			const dlg = candidates[ci];
			if (!dlg) continue;

			const wrap =
				dlg.querySelector(".flex.flex-wrap.justify-center.items-center") ||
				dlg.querySelector(".flex.flex-wrap.justify-center") ||
				dlg.querySelector(".flex.flex-wrap");
			if (!wrap) continue;

			// Lấy các cell div
			const children = Array.from(wrap.children).filter(
				(el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
			);
			if (children.length < 16) continue;
			const cells = children.slice(0, 16);

			// Từ cell → __reactFiber → đi lên (.return) tìm hook chứa items[16]
			for (let ci2 = 0; ci2 < cells.length; ci2 += 1) {
				const cell = cells[ci2];
				const fiberKey = Object.keys(cell).find(
					(k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
				);
				if (!fiberKey) continue;
				let f = cell[fiberKey];
				for (let depth = 0; depth < 80 && f; depth += 1) {
					const found = _findGrid16InFiber(f);
					if (found) return found;
					f = f.return;
				}
			}

			// Fallback: thử BFS từ dialog fiber
			const dlgFiberKey = Object.keys(dlg).find(
				(k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
			);
			if (dlgFiberKey) {
				const queue = [dlg[dlgFiberKey]];
				let steps = 0;
				const visited = new Set();
				while (queue.length && steps < 20000) {
					const f = queue.shift();
					steps += 1;
					if (!f || visited.has(f)) continue;
					visited.add(f);
					const found = _findGrid16InFiber(f);
					if (found) return found;
					let c = f.child;
					while (c) { queue.push(c); c = c.sibling; }
				}
			}
		}

		return null;
	}

	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		const data = event.data;
		if (!data || data._sfl !== true) return;
		if (data.type === "SFL_READ_CAPTCHA_GRID") {
			try {
				const items = _readCaptchaGridItems();
				window.postMessage({
					_sfl: true,
					type: "SFL_CAPTCHA_GRID_RESULT",
					reqId: data.reqId,
					items: items,
					error: items ? null : "not_found",
				}, "*");
			} catch (err) {
				window.postMessage({
					_sfl: true,
					type: "SFL_CAPTCHA_GRID_RESULT",
					reqId: data.reqId,
					items: null,
					error: err?.message || "read_error",
				}, "*");
			}
		}
	});

	window.postMessage({ _sfl: true, type: "SFL_BRIDGE_READY" }, "*");

	// Intercept history navigation to notify content script of page changes.
	// React Router uses pushState/replaceState which don't fire hashchange/popstate.
	const _notifyNavigate = () => {
		window.postMessage({ _sfl: true, type: "SFL_PAGE_NAVIGATE", href: window.location.href, hash: window.location.hash }, "*");
	};
	const _origPush = history.pushState.bind(history);
	const _origReplace = history.replaceState.bind(history);
	history.pushState = function (...args) {
		_origPush(...args);
		_notifyNavigate();
	};
	history.replaceState = function (...args) {
		_origReplace(...args);
		_notifyNavigate();
	};
	window.addEventListener("hashchange", _notifyNavigate);
	window.addEventListener("popstate", _notifyNavigate);
})();
