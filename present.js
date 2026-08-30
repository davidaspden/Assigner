/* ============================================================
   Sweep — Accordion View with Dynamic Live-Loading & Scaling
   ============================================================ */

let assignerData = { groups: [], banner: "", title: "Staff Assignment" };
let PLATES = [];
let N = 1;
let nodes = [];
const SECONDS_PER_CARD = 2.2; // 2x faster speed
const SNAP_MS = 450;
const MAX_ROT = 48; // Less extreme angle for better readability in 3D perspective
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let latestRawData = null;

function renderPlateInnerHtml(card) {
    let assignedHtml = (card.assigned || []).map(name => `<li class="plate-assigned-li">${name}</li>`).join('');
    let copyHtml = card.copy ? `<div style="font-size: 1em; font-style: italic; margin-bottom: 15px; color: #333; text-align: center;">${card.copy}</div>` : '';
    
    return `<article class="plate-face" style="background-color: ${card.color || '#fff'}; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; outline: 1px solid rgba(0,0,0,0.2); outline-offset: -1px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5), 0 18px 40px rgba(0, 0, 0, 0.45);">
        <div style="font-size: 1.5em; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid rgba(0,0,0,0.2); padding-bottom: 5px; color: black; text-align: center;">${card.title}</div>
        ${copyHtml}
        <div style="flex: 1; overflow-y: auto;">
            <ul class="plate-assigned-ul">
                ${assignedHtml}
            </ul>
        </div>
    </article>`;
}

function loadInitialData() {
    const saved = localStorage.getItem("assignerData");
    if (saved) {
        latestRawData = saved;
        try {
            assignerData = JSON.parse(saved);
        } catch(e){}
    }
    
    updateHeaderAndBanner();

    PLATES = (assignerData.groups || []).map(g => ({
        id: g.id,
        title: g.title || "Untitled",
        copy: g.description || "",
        color: g.color || "#ffffff",
        assigned: g.assigned || []
    }));

    if (PLATES.length === 0) {
        PLATES.push({ id: 1, title: 'No groups yet', copy: 'Add some in the editor', color: '#eeeeee', assigned: [] });
    }
    
    N = PLATES.length;
}

function updateHeaderAndBanner() {
    const mainTitle = document.getElementById("main-title");
    if (mainTitle) mainTitle.innerText = assignerData.title || "Staff Assignment";
    
    const bannerText = document.getElementById("banner-text");
    if (bannerText) bannerText.innerText = assignerData.banner || "";
    
    updateStatsSubtitle();
    updateTotalCount();
}

function updateStatsSubtitle() {
    const statsEl = document.getElementById("stats-subtitle");
    if (!statsEl) return;
    
    const groups = assignerData.groups || [];
    const totalPeople = groups.reduce((acc, g) => acc + ((g.assigned && Array.isArray(g.assigned)) ? g.assigned.length : 0), 0);
    const totalCards = groups.length;
    
    const peopleLabel = totalPeople === 1 ? "Person" : "People";
    const cardsLabel = totalCards === 1 ? "Group" : "Groups";
    
    statsEl.innerText = `${totalPeople} ${peopleLabel} Assigned · ${totalCards} ${cardsLabel}`;
}

function updateTotalCount() {
    const totalEl = document.getElementById("total-count");
    if (totalEl) {
        totalEl.innerText = String(PLATES.length).padStart(2, "0");
    }
}

function getLoopSeconds() {
    return Math.max(3, N * SECONDS_PER_CARD);
}

/* --- the rail --- */

function fract(x) { return x - Math.floor(x); }
function cubicOut(p) { p = Math.min(1, Math.max(0, p)); return 1 - (1 - p) ** 3; }
function phase(i, t) { return fract(t - i / N); }
function focusedIndex(t) { return (((Math.round((t - 0.5) * N) % N) + N) % N); }
function shortestDelta(from, to) { return fract(to - from + 0.5) - 0.5; }

function poseFor(u, spread) {
    const d = u * 2 - 1;          // -1 left … 0 front … +1 right
    const d2 = d * d;
    const edge = Math.abs(d);
    const fade = edge > 0.91 ? Math.max(0, 1 - (edge - 0.91) / 0.09) : 1;
    const wing = 0.66 + 0.34 * (1 - edge * 0.3);
    return {
        x: d * spread,
        z: reduced ? 0 : (1 - d2) * 230, // Deeper 3D perspective curve
        rotateY: reduced ? 0 : -MAX_ROT * d * (0.35 + 0.65 * d2),
        scale: 0.78 + 0.22 * (1 - d2),
        opacity: fade * wing,
        zIndex: Math.round((1 - edge) * 200),
    };
}

/* --- clock --- */

let t = 0.5;
let playing = !reduced;
let dragging = false;
let moved = false;
let open = false;
let snap = null;               // { from, delta, start, dur }
let pointer = null;            // { id, x, t0 }
let lastFocus = -1;

const stage = document.getElementById("stage");
const toggleBtn = document.getElementById("toggle");
const overlay = document.getElementById("overlay");

function buildNodes() {
    if (!stage) return;
    stage.innerHTML = "";
    nodes = PLATES.map((card, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "plate";
        btn.id = "plate-" + card.id;
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-label", card.title);
        btn.innerHTML = renderPlateInnerHtml(card);
        btn.addEventListener("click", () => onCardClick(i));
        stage.appendChild(btn);
        return btn;
    });
    updateTotalCount();
}

loadInitialData();
buildNodes();

function checkStorageUpdate() {
    const saved = localStorage.getItem("assignerData");
    if (!saved || saved === latestRawData) return;
    latestRawData = saved;
    
    let newData;
    try {
        newData = JSON.parse(saved);
    } catch(e) { return; }
    
    assignerData = newData;
    updateHeaderAndBanner();
    
    const newGroups = newData.groups || [];
    if (newGroups.length !== PLATES.length) {
        const currentFocus = focusedIndex(t);
        PLATES = newGroups.map(g => ({
            id: g.id,
            title: g.title || "Untitled",
            copy: g.description || "",
            color: g.color || "#ffffff",
            assigned: g.assigned || []
        }));
        if (PLATES.length === 0) {
            PLATES.push({ id: 1, title: 'No groups yet', copy: 'Add some in the editor', color: '#eeeeee', assigned: [] });
        }
        N = PLATES.length;
        buildNodes();
        t = fract(0.5 + (currentFocus % N) / N);
    } else {
        newGroups.forEach((g, idx) => {
            const current = PLATES[idx];
            if (!current) return;
            const hasChanged = 
                current.id !== g.id ||
                current.title !== (g.title || "Untitled") ||
                current.copy !== (g.description || "") ||
                current.color !== (g.color || "#ffffff") ||
                JSON.stringify(current.assigned) !== JSON.stringify(g.assigned || []);
            
            if (hasChanged) {
                PLATES[idx] = {
                    id: g.id,
                    title: g.title || "Untitled",
                    copy: g.description || "",
                    color: g.color || "#ffffff",
                    assigned: g.assigned || []
                };
                if (nodes[idx]) {
                    nodes[idx].id = "plate-" + g.id;
                    nodes[idx].setAttribute("aria-label", PLATES[idx].title);
                    nodes[idx].innerHTML = renderPlateInnerHtml(PLATES[idx]);
                }
            }
        });
    }
}

// Fast polling & event listeners for instant synchronization
setInterval(checkStorageUpdate, 150);
window.addEventListener("storage", checkStorageUpdate);
window.addEventListener("message", (e) => {
    if (e.data === 'assignerDataUpdate') {
        checkStorageUpdate();
    }
});

function draw() {
    if (!stage) return;
    // Spread calculation: 10% wider with less overlap
    const spread = Math.min(stage.clientWidth * 0.64, 760);
    const focus = focusedIndex(t);
    for (let i = 0; i < N; i++) {
        if (!nodes[i]) continue;
        const u = phase(i, t);
        const p = poseFor(u, spread);
        const el = nodes[i];
        el.style.transform =
            "translate3d(" + p.x + "px,0," + p.z + "px) rotateY(" + p.rotateY + "deg) scale(" + p.scale + ")";
        el.style.opacity = p.opacity;
        el.style.zIndex = p.zIndex;
        el.style.pointerEvents = p.opacity < 0.16 ? "none" : "auto";
        el.classList.toggle("is-front", i === focus);
        el.setAttribute("aria-selected", i === focus ? "true" : "false");
    }
    if (focus !== lastFocus) {
        lastFocus = focus;
        const idxEl = document.getElementById("idx");
        if (idxEl) idxEl.textContent = String(focus + 1).padStart(2, "0");
    }
}

function snapTo(target) {
    const delta = shortestDelta(t, fract(target));
    if (Math.abs(delta) < 1e-4) return;
    snap = { from: t, delta: delta, start: performance.now(), dur: reduced ? 1 : SNAP_MS };
}

function step(dir) {
    playing = false;
    syncPlay();
    snapTo(t + dir / N);
}

function goToIndex(i) {
    playing = false;
    syncPlay();
    snapTo(0.5 + i / N);
}

function onCardClick(i) {
    if (dragging) return;
    if (i === focusedIndex(t)) openDialog();
    else goToIndex(i);
}

function syncPlay() {
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("is-playing", playing);
    toggleBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
}

function openDialog() {
    playing = false;
    syncPlay();
    open = true;
    const card = PLATES[focusedIndex(t)];
    const titleEl = document.getElementById("dlg-title");
    if(titleEl) titleEl.textContent = card.title;
    const copyEl = document.getElementById("dlg-copy");
    if(copyEl) {
        copyEl.textContent = card.copy || "";
        copyEl.style.display = card.copy ? "block" : "none";
    }
    const assignedEl = document.getElementById("dlg-assigned");
    if(assignedEl) {
        if (card.assigned && card.assigned.length > 0) {
            assignedEl.innerHTML = `
                <h3 style="font-size: 0.95rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 1.5rem 0 0.5rem;">Assigned Staff (${card.assigned.length})</h3>
                <ul class="dialog-list">
                    ${card.assigned.map(name => `<li>${name}</li>`).join('')}
                </ul>
            `;
        } else {
            assignedEl.innerHTML = `<p style="color: var(--muted); font-style: italic; margin-top: 1rem;">No staff assigned to this group.</p>`;
        }
    }
    const dialogBox = document.querySelector(".dialog");
    if (dialogBox) {
        dialogBox.style.borderTopColor = card.color || "var(--fg)";
    }
    if(overlay) overlay.hidden = false;
}

function closeDialog() {
    open = false;
    if(overlay) overlay.hidden = true;
}

/* --- one loop --- */

let last = performance.now();
function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (snap) {
        const p = Math.min(1, (now - snap.start) / snap.dur);
        t = fract(snap.from + snap.delta * cubicOut(p));
        if (p >= 1) snap = null;
    } else if (playing && !dragging && !open) {
        t = fract(t + dt / getLoopSeconds());
    }
    draw();
    requestAnimationFrame(tick);
}

/* --- input listeners --- */

if (stage) {
    stage.addEventListener("pointerdown", (e) => {
        if (open || e.button !== 0) return;
        pointer = { id: e.pointerId, x: e.clientX, t0: t };
        moved = false;
        dragging = false;
        snap = null;
    });

    stage.addEventListener("pointermove", (e) => {
        if (!pointer || pointer.id !== e.pointerId) return;
        const dx = e.clientX - pointer.x;
        if (!moved && Math.abs(dx) < 8) return;
        moved = true;
        if (!dragging) {
            dragging = true;
            playing = false;
            syncPlay();
            stage.classList.add("is-dragging");
            stage.setPointerCapture(e.pointerId);
        }
        t = fract(pointer.t0 + dx / (stage.clientWidth * 2.4));
    });

    function endPointer(e) {
        if (!pointer || pointer.id !== e.pointerId) return;
        pointer = null;
        dragging = false;
        stage.classList.remove("is-dragging");
        if (moved) snapTo(0.5 + focusedIndex(t) / N);
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    stage.addEventListener("wheel", (e) => {
        if (open) return;
        e.preventDefault();
        playing = false;
        syncPlay();
        snap = null;
        t = fract(t + (e.deltaX || e.deltaY) / (stage.clientWidth * 2.8));
    }, { passive: false });
}

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { closeDialog(); return; }
    if (open) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === " ") { e.preventDefault(); playing = !playing; syncPlay(); }
    else if (e.key === "Enter") { e.preventDefault(); openDialog(); }
});

if (document.getElementById("prev")) document.getElementById("prev").onclick = () => step(-1);
if (document.getElementById("next")) document.getElementById("next").onclick = () => step(1);
if (toggleBtn) toggleBtn.onclick = () => { playing = !playing; syncPlay(); };
if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDialog(); });
if (document.getElementById("dlg-close")) document.getElementById("dlg-close").onclick = closeDialog;

syncPlay();
draw();
requestAnimationFrame(tick);