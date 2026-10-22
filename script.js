// BeatBox Music Player — 50 original browser-generated instrumental tracks.
// Audio is synthesized locally with the Web Audio API; no copyrighted recordings are bundled.
const $ = (selector) => document.querySelector(selector);
const trackListEl = $('#trackList');
const searchInput = $('#searchInput');
const moodButtons = [...document.querySelectorAll('.mood-pill')];
const navButtons = [...document.querySelectorAll('.nav-item')];

const palettes = [
  {name:'Lavender Drift', mood:'Chill', genre:'Lo-fi / Chill', bpm:78, color:['#6f5bd3','#bd87ff'], wave:'sine'},
  {name:'Neon Steps', mood:'Energy', genre:'Electronic', bpm:122, color:['#ef5caa','#6d45cf'], wave:'sawtooth'},
  {name:'Quiet Orbit', mood:'Focus', genre:'Ambient', bpm:86, color:['#347caa','#6a8dca'], wave:'triangle'},
  {name:'Cloud Nine', mood:'Dreamy', genre:'Dream Pop', bpm:92, color:['#a26bd8','#f08bc8'], wave:'sine'},
  {name:'Midnight Metro', mood:'Energy', genre:'Synthwave', bpm:110, color:['#dc5a83','#4e4dc3'], wave:'square'},
  {name:'Coffee & Code', mood:'Focus', genre:'Lo-fi / Chill', bpm:84, color:['#b47751','#e4b47c'], wave:'triangle'},
  {name:'Blue Hour', mood:'Chill', genre:'Ambient', bpm:72, color:['#4278a7','#7e9ee0'], wave:'sine'},
  {name:'Pixel Garden', mood:'Dreamy', genre:'Chiptune', bpm:104, color:['#45a78e','#6c79dc'], wave:'square'},
  {name:'Golden Haze', mood:'Chill', genre:'Downtempo', bpm:88, color:['#d18b54','#bd668d'], wave:'triangle'},
  {name:'Afterglow', mood:'Dreamy', genre:'Synth Pop', bpm:96, color:['#8a5dc7','#e679b4'], wave:'sine'}
];
const suffixes = ['Intro','Motion','Daydream','Reflections','Sunrise','After Hours','Soft Focus','Open Road','New Chapter','Stargazer'];
const tracks = Array.from({length:50}, (_, i) => {
  const p = palettes[i % palettes.length];
  const n = Math.floor(i / palettes.length) + 1;
  return {
    id: i + 1, title: `${p.name} ${n > 1 ? ['II','III','IV','V'][n-2] || `Vol. ${n}` : ''}`.trim(),
    artist: 'BeatBox Studio', mood: p.mood, genre: p.genre, bpm: p.bpm + ((i * 3) % 9 - 4),
    duration: 92 + ((i * 17 + 31) % 79), colors: p.color, wave: p.wave,
    seed: i + 19, favorite: false, plays: 0
  };
});

const state = {
  currentId: null, playing: false, mood: 'All', view: 'all',
  query: '', shuffle: false, repeat: false, volume: 0.65,
  playedIds: [], audioContext: null, masterGain: null, timerId: null,
  startAt: 0, elapsedBeforePause: 0, noteTimers: [], activeNodes: [],
  history: [], historyIndex: -1, toastTimer: null
};

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function currentTrack() { return tracks.find(t => t.id === state.currentId) || null; }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function persist() {
  try {
    localStorage.setItem('beatbox-settings', JSON.stringify({
      favorites: tracks.filter(t => t.favorite).map(t => t.id),
      volume: state.volume, shuffle: state.shuffle, repeat: state.repeat
    }));
  } catch (error) { /* localStorage may be unavailable in private browsing */ }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem('beatbox-settings') || '{}');
    (saved.favorites || []).forEach(id => { const t = tracks.find(x => x.id === id); if (t) t.favorite = true; });
    if (typeof saved.volume === 'number') state.volume = Math.min(1, Math.max(0, saved.volume));
    state.shuffle = !!saved.shuffle; state.repeat = !!saved.repeat;
  } catch (error) {}
  $('#volumeSlider').value = Math.round(state.volume * 100);
  $('#volumeValue').textContent = `${Math.round(state.volume * 100)}%`;
  $('#shuffleBtn').classList.toggle('active', state.shuffle);
  $('#repeatBtn').classList.toggle('active', state.repeat);
}
function getVisibleTracks() {
  let list = [...tracks];
  if (state.view === 'favorites') list = list.filter(t => t.favorite);
  if (state.view === 'recent') list = list.filter(t => state.playedIds.includes(t.id))
    .sort((a, b) => state.playedIds.indexOf(b.id) - state.playedIds.indexOf(a.id));
  if (state.mood !== 'All') list = list.filter(t => t.mood === state.mood);
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter(t => `${t.title} ${t.artist} ${t.mood} ${t.genre} ${t.bpm}`.toLowerCase().includes(q));
  }
  const sort = $('#sortSelect').value;
  if (sort === 'title') list.sort((a,b) => a.title.localeCompare(b.title));
  if (sort === 'duration') list.sort((a,b) => a.duration - b.duration);
  return list;
}
function renderTracks() {
  const list = getVisibleTracks();
  const viewNames = {all:'All tracks', favorites:'Your favorites', recent:'Recently played'};
  $('#listTitle').innerHTML = `${viewNames[state.view]} <span class="track-total" id="trackCount">${list.length} ${list.length === 1 ? 'song' : 'songs'}</span>`;
  $('#listEyebrow').textContent = state.view === 'all' ? 'THE COLLECTION' : state.view === 'favorites' ? 'SAVED BY YOU' : 'YOUR LISTENING HISTORY';
  trackListEl.innerHTML = list.map((track, index) => {
    const playing = track.id === state.currentId;
    const gradient = `linear-gradient(135deg, ${track.colors[0]}, ${track.colors[1]})`;
    return `<article class="track-row ${playing ? 'playing' : ''}" data-track-id="${track.id}">
      <div class="row-num"><span class="row-index">${String(index + 1).padStart(2,'0')}</span><span class="row-play">${playing && state.playing ? '♫' : '▶'}</span></div>
      <div class="track-info"><div class="cover-art" style="background:${gradient}"><span>♫</span></div><div class="track-text"><strong>${escapeHtml(track.title)}</strong><small>${track.genre} · ${track.bpm} BPM</small></div></div>
      <div><span class="mood-tag">${track.mood}</span></div><span class="track-duration">${formatTime(track.duration)}</span>
      <div class="row-actions"><button class="icon-btn ${track.favorite ? 'is-favorite' : ''}" data-action="favorite" data-id="${track.id}" aria-label="${track.favorite ? 'Remove from favorites' : 'Add to favorites'}">${track.favorite ? '♥' : '♡'}</button></div>
    </article>`;
  }).join('');
  $('#emptyState').classList.toggle('hidden', list.length > 0);
  trackListEl.classList.toggle('hidden', list.length === 0);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
function updatePlayer() {
  const track = currentTrack();
  $('#playPauseBtn').textContent = state.playing ? 'Ⅱ' : '▶';
  $('#playPauseBtn').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  $('#nowTitle').textContent = track ? track.title : 'Choose a track';
  $('#nowArtist').textContent = track ? `${track.genre} · ${track.bpm} BPM` : 'BeatBox Studio · Original synth';
  $('#miniCover').style.background = track ? `linear-gradient(135deg,${track.colors[0]},${track.colors[1]})` : 'linear-gradient(135deg,#6d56c8,#e57bc3)';
  $('#currentFavBtn').textContent = track && track.favorite ? '♥' : '♡';
  $('#currentFavBtn').classList.toggle('is-favorite', !!(track && track.favorite));
  $('#durationLabel').textContent = track ? formatTime(track.duration) : '0:00';
  $('#currentTime').textContent = formatTime(state.elapsedBeforePause);
  $('#progressBar').value = track ? Math.round(state.elapsedBeforePause / track.duration * 1000) : 0;
  $('#shuffleBtn').classList.toggle('active', state.shuffle);
  $('#repeatBtn').classList.toggle('active', state.repeat);
}
function initAudio() {
  if (!state.audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { showToast('Web Audio is not supported in this browser.'); return false; }
    state.audioContext = new AudioCtx();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = state.volume;
    state.masterGain.connect(state.audioContext.destination);
  }
  if (state.audioContext.state === 'suspended') state.audioContext.resume();
  return true;
}
function stopAudioNodes() {
  state.noteTimers.forEach(clearTimeout); state.noteTimers = [];
  state.activeNodes.forEach(node => { try { node.stop(); } catch (e) {} });
  state.activeNodes = [];
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}
const scaleSets = [
  [0,2,4,7,9,12,9,7,4,2], [0,3,5,7,10,12,10,7,5,3],
  [0,2,5,7,9,14,12,9,7,5], [0,4,7,11,12,11,7,4,2,4],
  [0,3,7,8,10,15,12,10,8,7]
];
function midiToHz(note) { return 440 * Math.pow(2, (note - 69) / 12); }
function playNote(track, step, when) {
  const ctx = state.audioContext;
  if (!ctx || !state.playing || track.id !== state.currentId) return;
  const palette = palettes[(track.id - 1) % palettes.length];
  const scale = scaleSets[(track.seed + Math.floor(track.id / 3)) % scaleSets.length];
  const root = 48 + (track.seed % 12);
  const degree = scale[(step + track.seed) % scale.length];
  const octave = step % 4 === 0 ? 12 : 0;
  const freq = midiToHz(root + degree + octave);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = palette.wave;
  osc.frequency.setValueAtTime(freq, when);
  if (palette.wave === 'sawtooth' || palette.wave === 'square') {
    filter.type = 'lowpass'; filter.frequency.value = 1000 + (track.seed % 8) * 160;
    osc.connect(filter); filter.connect(gain);
  } else { osc.connect(gain); }
  const noteLength = 60 / track.bpm * (step % 4 === 0 ? 0.9 : 0.65);
  const volume = (step % 4 === 0 ? 0.11 : 0.065) * (0.7 + (track.seed % 4) * 0.08);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + noteLength);
  gain.connect(state.masterGain);
  osc.start(when); osc.stop(when + noteLength + 0.03);
  state.activeNodes.push(osc);
  // A soft bass pulse on the first beat gives the generated loop more rhythm.
  if (step % 4 === 0) {
    const bass = ctx.createOscillator(); const bassGain = ctx.createGain();
    bass.type = 'sine'; bass.frequency.setValueAtTime(midiToHz(root - 12), when);
    bassGain.gain.setValueAtTime(0.0001, when);
    bassGain.gain.exponentialRampToValueAtTime(0.09, when + 0.02);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    bass.connect(bassGain); bassGain.connect(state.masterGain);
    bass.start(when); bass.stop(when + 0.31); state.activeNodes.push(bass);
  }
}
function scheduleTrackLoop(track) {
  stopAudioNodes();
  if (!state.playing || !state.audioContext) return;
  const beatMs = 60000 / track.bpm;
  let step = 0;
  const schedule = () => {
    if (!state.playing || state.currentId !== track.id) return;
    const start = state.audioContext.currentTime + 0.04;
    playNote(track, step, start);
    // A subtle off-beat note adds movement to the arrangement.
    if (step % 2 === 1 && track.mood !== 'Focus') {
      const scale = scaleSets[track.seed % scaleSets.length];
      const note = 55 + (track.seed % 12) + scale[(step + 3) % scale.length];
      const ctx = state.audioContext, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = midiToHz(note);
      gain.gain.setValueAtTime(0.0001, start + beatMs/1000*0.5);
      gain.gain.exponentialRampToValueAtTime(0.025, start + beatMs/1000*0.5 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + beatMs/1000*0.5 + 0.2);
      osc.connect(gain); gain.connect(state.masterGain);
      osc.start(start + beatMs/1000*0.5); osc.stop(start + beatMs/1000*0.5 + 0.22);
      state.activeNodes.push(osc);
    }
    step++;
    state.noteTimers.push(setTimeout(schedule, beatMs));
  };
  schedule();
}
function startPlayback() {
  const track = currentTrack();
  if (!track || !initAudio()) return;
  state.playing = true;
  state.startAt = Date.now() - state.elapsedBeforePause * 1000;
  scheduleTrackLoop(track);
  state.timerId = setInterval(() => {
    if (!state.playing) return;
    const elapsed = (Date.now() - state.startAt) / 1000;
    if (elapsed >= track.duration) {
      if (state.repeat) { state.elapsedBeforePause = 0; state.startAt = Date.now(); scheduleTrackLoop(track); }
      else nextTrack(true);
      return;
    }
    state.elapsedBeforePause = elapsed;
    $('#currentTime').textContent = formatTime(elapsed);
    $('#progressBar').value = Math.round(elapsed / track.duration * 1000);
  }, 250);
  updatePlayer(); renderTracks();
}
function pausePlayback() {
  if (!state.playing) return;
  state.playing = false;
  state.elapsedBeforePause = Math.max(0, (Date.now() - state.startAt) / 1000);
  stopAudioNodes(); updatePlayer(); renderTracks();
}
function playTrack(id) {
  const track = tracks.find(t => t.id === Number(id));
  if (!track) return;
  if (state.currentId === track.id && state.playing) { pausePlayback(); return; }
  if (state.currentId !== track.id) {
    state.currentId = track.id; state.elapsedBeforePause = 0;
    state.playedIds = [track.id, ...state.playedIds.filter(x => x !== track.id)].slice(0, 20);
    track.plays++;
  }
  state.playing = false; stopAudioNodes(); startPlayback(); renderTracks();
}
function nextTrack(auto = false) {
  const current = currentTrack();
  if (!current) { playTrack(1); return; }
  const pool = getVisibleTracks().length ? getVisibleTracks() : tracks;
  let next;
  if (state.shuffle && pool.length > 1) {
    const choices = pool.filter(t => t.id !== current.id);
    next = choices[Math.floor(Math.random() * choices.length)];
  } else {
    const index = pool.findIndex(t => t.id === current.id);
    next = pool[(index + 1 + pool.length) % pool.length] || tracks[(current.id) % tracks.length];
  }
  state.elapsedBeforePause = 0; state.currentId = next.id; state.playing = false;
  stopAudioNodes(); startPlayback();
}
function previousTrack() {
  if (state.elapsedBeforePause > 3) { state.elapsedBeforePause = 0; state.playing = false; stopAudioNodes(); startPlayback(); return; }
  const pool = getVisibleTracks().length ? getVisibleTracks() : tracks;
  const index = pool.findIndex(t => t.id === state.currentId);
  const prev = pool[(index - 1 + pool.length) % pool.length] || tracks[0];
  state.currentId = prev.id; state.elapsedBeforePause = 0; state.playing = false; stopAudioNodes(); startPlayback();
}
function toggleFavorite(id) {
  const track = tracks.find(t => t.id === Number(id)); if (!track) return;
  track.favorite = !track.favorite; persist(); renderTracks(); updatePlayer();
  showToast(track.favorite ? 'Added to favorites ♥' : 'Removed from favorites');
}
function setView(view) {
  state.view = view;
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  renderTracks();
}
function setMood(mood) {
  state.mood = mood;
  moodButtons.forEach(btn => btn.classList.toggle('selected', btn.dataset.mood === mood));
  renderTracks();
}

trackListEl.addEventListener('click', event => {
  const favoriteBtn = event.target.closest('[data-action="favorite"]');
  if (favoriteBtn) { event.stopPropagation(); toggleFavorite(favoriteBtn.dataset.id); return; }
  const row = event.target.closest('[data-track-id]');
  if (row) playTrack(row.dataset.trackId);
});
navButtons.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
moodButtons.forEach(btn => btn.addEventListener('click', () => setMood(btn.dataset.mood)));
searchInput.addEventListener('input', () => { state.query = searchInput.value.trim(); renderTracks(); });
$('#sortSelect').addEventListener('change', renderTracks);
$('#playPauseBtn').addEventListener('click', () => {
  if (!currentTrack()) { playTrack(1); return; }
  state.playing ? pausePlayback() : startPlayback();
});
$('#heroPlayBtn').addEventListener('click', () => {
  const visible = getVisibleTracks();
  if (visible.length) playTrack(visible[Math.floor(Math.random() * visible.length)].id);
  else playTrack(1);
});
$('#nextBtn').addEventListener('click', () => nextTrack());
$('#prevBtn').addEventListener('click', previousTrack);
$('#shuffleBtn').addEventListener('click', () => { state.shuffle = !state.shuffle; persist(); updatePlayer(); showToast(state.shuffle ? 'Shuffle enabled' : 'Shuffle disabled'); });
$('#repeatBtn').addEventListener('click', () => { state.repeat = !state.repeat; persist(); updatePlayer(); showToast(state.repeat ? 'Repeat enabled' : 'Repeat disabled'); });
$('#currentFavBtn').addEventListener('click', () => { if (currentTrack()) toggleFavorite(state.currentId); else showToast('Play a track first'); });
$('#volumeSlider').addEventListener('input', event => {
  state.volume = Number(event.target.value) / 100;
  if (state.masterGain) state.masterGain.gain.setTargetAtTime(state.volume, state.audioContext.currentTime, 0.03);
  $('#volumeValue').textContent = `${event.target.value}%`; persist();
});
$('#progressBar').addEventListener('input', event => {
  const track = currentTrack(); if (!track) return;
  state.elapsedBeforePause = Number(event.target.value) / 1000 * track.duration;
  if (state.playing) { state.startAt = Date.now() - state.elapsedBeforePause * 1000; }
  $('#currentTime').textContent = formatTime(state.elapsedBeforePause);
});
$('#clearFiltersBtn').addEventListener('click', () => {
  searchInput.value = ''; state.query = ''; setMood('All'); setView('all'); $('#sortSelect').value = 'featured';
});
$('#backBtn').addEventListener('click', () => showToast('You are on the BeatBox home screen'));
$('#forwardBtn').addEventListener('click', () => showToast('Nothing ahead yet'));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.focus(); }
  if (event.code === 'Space' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault(); $('#playPauseBtn').click();
  }
  if (event.key === 'ArrowRight' && event.altKey) nextTrack();
  if (event.key === 'ArrowLeft' && event.altKey) previousTrack();
});

restore();
renderTracks();
updatePlayer();
