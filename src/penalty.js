// Penalty's bij FC Gulpen: eerst richten (het mikpunt zwiert door het doel), dan de kracht timen.
// De keeper schuifelt op de lijn, leert je patroon kennen en duikt. Te hard = over, te zacht = makkelijk.
import * as THREE from 'three';
import { makeCharacter } from './character.js';
import { popText, flash, bump } from './minifx.js';

const POST = 3.66, BAR = 2.44, R = 0.11;
const GREEN = [0.55, 0.85]; // goede kracht
const TAUNTS = ['Kom maar op, jong!', 'Deze pak ik!', 'Links of rechts? Ik weet het al.', 'Ik heb je wel door, hoor.', 'Zenuwachtig?', 'Mijn oma schiet harder.'];
const AFTER = {
  goal: ['GOAL!', 'Snoeihard erin!', 'In de kruising!', 'Netjes!'],
  saved: ['Gestopt!', 'Wat een redding!', 'Keeper heeft hem!'],
  post: ['Paal!'], bar: ['Lat!'], wide: ['Naast!'], over: ['Over! Die ligt in de Gulp.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function startPenalty(g) {
  return new Promise((resolve) => {
    const f = g.facades;
    if (!f.pitch) { resolve(0); return; }
    if (g.mode === 'car') g.exitCar();
    g.setMode('walk');
    const w = g.world;
    const { L } = f.pitch;
    const goalZ = L / 2;
    const [spotX, spotZ] = f.pitchToWorld(0, goalZ - 11);
    const [gx, gz] = f.pitchToWorld(0, goalZ);
    const heading = Math.atan2(gx - spotX, gz - spotZ);
    const right = [Math.cos(heading), -Math.sin(heading)];
    // lateral: + is naar links vanuit de schutter gezien; along: richting het doel
    const toWorld = (lateral, along) => [spotX + Math.sin(heading) * along - right[0] * lateral, spotZ + Math.cos(heading) * along - right[1] * lateral];
    const baseY = w.heightAt(gx, gz);
    const spotY = w.heightAt(spotX, spotZ);
    const ground = (x, z) => w.heightAt(x, z);

    // het net van dit doel, om op te laten bollen
    let net = null, netZ = 0;
    let bestD = Infinity;
    for (const goal of f.goals || []) {
      const p = goal.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(p.x - gx, p.z - gz);
      if (d < bestD) { bestD = d; net = goal.children.find((c) => c.geometry?.parameters?.depth === 1.6) || null; }
    }
    if (net) netZ = net.position.z;
    let bulge = 0;

    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true }));
    ball.castShadow = true;
    g.scene.add(ball);
    const keeper = makeCharacter({ shirt: 0xfdd835, pants: 0x111111, hair: 0x222222, sleeves: 'long' });
    g.scene.add(keeper);
    const aimMat = new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide, depthTest: false, transparent: true });
    const aim = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24), aimMat);
    aim.renderOrder = 20;
    g.scene.add(aim);

    // beeldlaag: scorebord, krachtbalk en uitleg
    const ov = document.createElement('div');
    ov.className = 'mini-overlay aim penalty-ov';
    ov.innerHTML = `<div class="mini-head"><b>Penalty's</b><span class="pen-board">${'<i></i>'.repeat(5)}</span><span class="mini-score"></span><button class="mini-stop" type="button">Stoppen</button></div>
      <div class="pen-power"><div class="pen-zone"></div><div class="pen-fill"></div><span>KRACHT</span></div>
      <div class="mini-hint"></div>`;
    document.getElementById('hud').prepend(ov);
    document.body.classList.add('penalty-on');
    ov.querySelector('.mini-stop').addEventListener('click', () => g.missions.stop());
    ov.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mini-stop')) g.input.actionPressed = true; });
    const zone = ov.querySelector('.pen-zone');
    zone.style.bottom = GREEN[0] * 100 + '%'; zone.style.height = (GREEN[1] - GREEN[0]) * 100 + '%';
    const fill = ov.querySelector('.pen-fill');
    const powerEl = ov.querySelector('.pen-power');
    const hint = ov.querySelector('.mini-hint');
    const dots = [...ov.querySelectorAll('.pen-board i')];
    const say = (txt) => popText(ov, txt, 50, 30, 'small');

    let shots = 0, goals = 0, phase = 'aim', t = 0, pt = 0, power = 0, shot = null, after = 0;
    let keeperX = 0, ax = 0, ay = 1;
    const history = []; // kant van eerdere schoten: -1, 0, 1
    const vel = new THREE.Vector3();

    const setHint = () => {
      const key = g.input.isTouch ? 'Tik' : 'Spatie of E';
      hint.textContent = phase === 'power' ? `${key}: schiet! Groen is goed, rood vliegt over.` : `${key}: zet het mikpunt vast. Daarna de kracht.`;
      g.ui.setActionLabel(phase === 'power' ? 'Schiet!' : 'Richt');
    };
    const reset = () => {
      const [bx, bz] = toWorld(0, 0);
      ball.position.set(bx, ground(bx, bz) + R, bz);
      ball.rotation.set(0, 0, 0);
      keeperX = 0;
      const [kx, kz] = toWorld(0, 10.6);
      keeper.position.set(kx, baseY, kz);
      keeper.rotation.set(0, heading + Math.PI, 0);
      const [px, pz] = toWorld(0, -1.4);
      g.player.x = px; g.player.z = pz; g.player.heading = heading;
      g.camYaw = heading + Math.PI;
      g.camPitch = 0.12;
      phase = 'aim'; t = Math.random() * 3; pt = 0; power = 0;
      aim.visible = true; aimMat.opacity = 1; aimMat.color.set(0xff5252);
      fill.style.height = '0%'; powerEl.classList.remove('on');
      setHint();
      if (shots > 0 && Math.random() < 0.7) say(pick(TAUNTS));
    };
    const finishAll = () => {
      cleanup();
      resolve(goals);
    };
    const cleanup = () => {
      g.scene.remove(ball, keeper, aim);
      ov.remove();
      document.body.classList.remove('penalty-on');
      if (net) { net.scale.z = 1; net.position.z = netZ; }
      g.penalty = null;
      g.player.lockedFor = false;
      g.ui.setActionLabel(null);
    };
    const score = () => {
      ov.querySelector('.mini-score').textContent = `${goals} van ${shots}`;
      g.missions.progress(`${goals} goals uit ${shots} van de 5`);
    };
    reset(); score();
    say('Scoor er minstens drie!');

    // de keeper beslist bij het schot waar hij heen duikt
    const keeperGuess = (side) => {
      const n = history.length;
      let read = 0.22 + shots * 0.06; // hij leert je kennen
      let guess = side;
      if (n >= 2 && history[n - 1] === history[n - 2] && history[n - 1] !== 0) {
        // twee keer dezelfde kant: die gok neemt hij vaak
        if (Math.random() < 0.6) return history[n - 1] * (1.6 + Math.random() * 1.2);
      }
      if (Math.random() < read) return ax + (Math.random() - 0.5) * 0.9;
      guess = [-1, 0, 1][Math.floor(Math.random() * 3)];
      return guess * (1.4 + Math.random() * 1.4);
    };

    g.penalty = {
      stop: cleanup,
      debug: { get phase() { return phase; }, get goals() { return goals; }, get shots() { return shots; } },
      update: (dt) => {
        t += dt;
        g.player.lockedFor = true;
        const pressed = g.input.consumeAction() || g.input.spacePressed;
        g.input.spacePressed = false;
        const sp = 1 + shots * 0.12; // elk schot een tikje sneller
        if (bulge > 0) { bulge = Math.max(0, bulge - dt * 1.6); if (net) { const s = 1 + Math.sin(Math.min(1, bulge) * Math.PI) * 0.35; net.scale.z = s; net.position.z = netZ * s; } }

        // keeper schuifelt op de lijn zolang er niet geschoten is
        if (phase === 'aim' || phase === 'power') {
          keeperX = Math.sin(t * 1.15) * 0.8 + Math.sin(t * 2.9) * 0.25;
          const [kx, kz] = toWorld(keeperX, 10.6);
          keeper.position.set(kx, baseY, kz);
          keeper.userData.animate(dt, 1.2, 'walk');
        }

        if (phase === 'aim') {
          ax = Math.sin(t * 1.9 * sp) * 3.95;
          ay = 0.2 + (Math.sin(t * 2.7 * sp + 1) * 0.5 + 0.5) * 2.4;
          const [wx, wz] = toWorld(ax, 11);
          aim.position.set(wx, baseY + ay, wz);
          aim.lookAt(g.camera.position);
          // buiten het doel kleurt het mikpunt donker
          aimMat.color.set(Math.abs(ax) > POST - 0.1 || ay > BAR - 0.1 ? 0x8b0000 : 0xff5252);
          if (pressed) {
            phase = 'power'; pt = 0;
            aimMat.opacity = 0.65;
            powerEl.classList.add('on'); bump(powerEl);
            g.sfx?.play('tally');
            setHint();
          }
        } else if (phase === 'power') {
          pt += dt;
          // driehoeksgolf 0 → 1 → 0, steeds iets sneller
          const c = (pt * 1.5 * (1 + shots * 0.1)) % 2;
          power = c < 1 ? c : 2 - c;
          fill.style.height = power * 100 + '%';
          fill.style.background = power > GREEN[1] ? '#e53935' : power >= GREEN[0] ? '#43a047' : '#fdd835';
          if (pressed) {
            // kracht verwerken: te hard = omhoog en scheef, te zacht = laag en langzaam
            let tx = ax, ty = ay;
            if (power > GREEN[1]) { ty += (power - GREEN[1]) * 9; tx += (Math.random() - 0.5) * (power - GREEN[1]) * 7; }
            if (power < 0.3) ty = Math.min(ty, 0.35);
            const pn = Math.min(1, power / GREEN[1]);
            const T = 0.95 - pn * 0.45;
            const side = Math.abs(ax) > 1 ? Math.sign(ax) : 0;
            const dive = keeperGuess(side);
            history.push(side);
            // haalt hij zijn duik op tijd? (reactie 0,12 s, volle duik duurt 0,55 s)
            const reach = Math.max(0, Math.min(1, (T - 0.12) / 0.55));
            const eff = keeperX + (dive - keeperX) * reach;
            let rw = 1.0 + (power < 0.4 ? 0.55 : 0);
            const rh = 2.25 - Math.abs(eff) * 0.1;
            if (Math.abs(tx) > 2.8 && ty > 1.85) rw *= 0.45; // kruising: bijna niet te houden
            let result;
            if (Math.abs(tx) > POST + 0.17) result = 'wide';
            else if (Math.abs(tx) > POST - 0.12) result = 'post';
            else if (ty > BAR + 0.17) result = 'over';
            else if (ty > BAR - 0.12) result = 'bar';
            else if (Math.abs(tx - eff) < rw && ty < rh) result = 'saved';
            else result = 'goal';
            shot = { tx, ty, dive, eff, T, t: 0, result, k0x: keeperX };
            g.sfx?.play('kick');
            g.player.speed = 3;
            phase = 'fly';
            aim.visible = false;
            powerEl.classList.remove('on');
            g.ui.setActionLabel(null);
          }
        } else if (phase === 'fly') {
          shot.t += dt / shot.T;
          const k = Math.min(1, shot.t);
          const [sx2, sz2] = toWorld(0, 0);
          const [ex, ez] = toWorld(shot.tx, 11);
          const y0 = spotY + R, y1 = baseY + Math.max(R, shot.ty);
          ball.position.set(sx2 + (ex - sx2) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 0.25, sz2 + (ez - sz2) * k);
          ball.rotation.x += dt * 25;
          // keeper duikt (na een korte reactie)
          const kd = Math.max(0, Math.min(1, (shot.t * shot.T - 0.12) / 0.55));
          const kxNow = shot.k0x + (shot.dive - shot.k0x) * kd;
          const [kx, kz] = toWorld(kxNow, 10.6);
          keeper.position.set(kx, baseY + Math.sin(kd * Math.PI) * 0.4, kz);
          keeper.rotation.z = -Math.sign(shot.dive - shot.k0x) * kd * Math.min(1.3, Math.abs(shot.dive - shot.k0x) * 0.6);
          if (k >= 1) {
            shots++;
            const r = shot.result;
            // de bal vervolgt zijn weg: in het net, terug van de paal, weggetikt of over
            const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
            const lat = new THREE.Vector3(-right[0], 0, -right[1]);
            if (r === 'goal') { vel.copy(fwd).multiplyScalar(6).addScaledVector(lat, shot.tx * 0.3); vel.y = 0.5; }
            else if (r === 'saved') { vel.copy(fwd).multiplyScalar(-4).addScaledVector(lat, Math.sign(shot.tx - shot.eff || 1) * 5); vel.y = 3; }
            else if (r === 'post') { vel.copy(fwd).multiplyScalar(-5).addScaledVector(lat, -Math.sign(shot.tx) * 2); vel.y = 1.5; }
            else if (r === 'bar') { vel.copy(fwd).multiplyScalar(-3); vel.y = 4; }
            else { vel.copy(fwd).multiplyScalar(14).addScaledVector(lat, Math.sign(shot.tx) * 2); vel.y = r === 'over' ? 4 : 1; }
            if (r === 'goal') {
              goals++;
              bulge = 1;
              flash(ov, 'gold');
              popText(ov, shot.tx * shot.tx > 7.8 && shot.ty > 1.85 ? 'In de kruising!' : pick(AFTER.goal), 50, 40, 'gold big');
              g.sfx?.play('cheer');
              dots[shots - 1].className = 'goal';
            } else {
              flash(ov, 'bad');
              popText(ov, pick(AFTER[r]), 50, 40, 'bad big');
              g.sfx?.play(r === 'post' || r === 'bar' ? 'clink' : r === 'saved' ? 'splat' : 'fail');
              dots[shots - 1].className = 'miss';
              if (r === 'saved') setTimeout(() => say(pick(['Haha! Te makkelijk!', 'Volgende!', 'Dacht ik al.'])), 700);
            }
            bump(dots[shots - 1]);
            score();
            phase = 'after'; after = 0;
          }
        } else if (phase === 'after') {
          after += dt;
          // eenvoudige stuiterbal
          vel.y -= 9.8 * dt;
          ball.position.addScaledVector(vel, dt);
          // het net vangt hem
          const along = (ball.position.x - spotX) * Math.sin(heading) + (ball.position.z - spotZ) * Math.cos(heading);
          if (shot.result === 'goal' && along > 12.2) { vel.multiplyScalar(0.2); }
          const gy = ground(ball.position.x, ball.position.z) + R;
          if (ball.position.y < gy) { ball.position.y = gy; vel.y = Math.abs(vel.y) * 0.45; vel.x *= 0.8; vel.z *= 0.8; }
          ball.rotation.x += dt * vel.length() * 4;
          if (after < 0.6) keeper.position.y = Math.max(baseY, keeper.position.y - dt * 1.5);
          if (after > 1.8) {
            keeper.rotation.z = 0;
            // niet meer te halen of klaar? dan stoppen
            const left = 5 - shots;
            if (shots >= 5 || goals + left < 3) finishAll();
            else reset();
          }
        }
      },
    };
  });
}
