/**
 * particles.js — NEURAL SPACE 背景粒子场引擎
 * ------------------------------------------------------------------
 * 设计原则（SPEC 三 / 十 / 十一）：必须克制 —— 淡蓝、慢速、稀疏、低亮；
 * 距离内极淡连接线；鼠标轻微排斥 / 扰动；页面隐藏时暂停；
 * 移动端减量；requestAnimationFrame + 增量时间控制（帧率无关）。
 *
 * 对外 API（挂载在 window.NSParticles，供 main.js 调用）：
 *   start()                  —— 启动动画循环（ENTER 后由 main.js 调用）
 *   stop()                   —— 停止动画循环
 *   boost(factor, duration)  —— 临时加速（SECRET MODE 彩蛋使用）
 *   setSpeed(factor)         —— 立即复位速度倍率（彩蛋自动恢复时调用）
 *
 * 零依赖、纯原生 JS、任何元素缺失都静默退出，无控制台报错。
 */
(function () {
  'use strict';

  /* ================= 画布获取（失败则静默退出） ================= */
  var canvas = document.getElementById('particles');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ================= 配置：克制参数 ================= */
  var COLOR_RGB = '146, 208, 255';   // 淡冰蓝（仅此一色，禁用霓虹）
  var LINE_DIST = 120;               // 粒子连线判定距离(px)
  var LINE_ALPHA = 0.13;             // 连线最大透明度（极淡）
  var REPULSE_RADIUS = 105;          // 鼠标扰动半径
  var REPULSE_FORCE = 0.5;           // 排斥力度（轻微）
  var BASE_SPEED = 0.16;             // 基础速度（慢速，px/帧@60fps）

  var DPR_CAP = 2;                   // 高分屏像素比上限（性能）
  var MOBILE_WIDTH = 768;            // 视口宽度小于此值 → 移动端减量

  /* ================= 运行时状态 ================= */
  var W = 0, H = 0, DPR = 1;
  var isMobile = false;
  var reducedMotion = false;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };

  var running = false;   // 是否处于运行状态（start 后为 true）
  var rafId = null;      // requestAnimationFrame id
  var lastTime = 0;      // 上一帧时间戳（增量控制）
  var speedFactor = 1;   // 速度倍率
  var boosting = false;  // 是否处于临时加速中
  var boostUntil = 0;    // 加速结束时间戳

  /* ================= 辅助函数 ================= */
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  function prefersReduced() {
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(mq && mq.matches);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ================= 视口 / 环境 ================= */
  function updateEnv() {
    isMobile = window.innerWidth < MOBILE_WIDTH;
    reducedMotion = prefersReduced();
  }

  function resize() {
    updateEnv();
    DPR = clamp(window.devicePixelRatio || 1, 1, DPR_CAP);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    rebuild(); // 视口变化后重建粒子场
  }

  /* ================= 粒子数量：桌面 / 移动端差异化 ================= */
  function desiredCount() {
    var area = W * H;
    if (isMobile) return clamp(Math.round(area / 32000), 14, 34);
    return clamp(Math.round(area / 22000), 26, 85);
  }

  /* ================= 重建粒子 ================= */
  function rebuild() {
    var n = desiredCount();
    particles = [];
    for (var i = 0; i < n; i++) {
      particles.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-1, 1),        // 方向分量（-1..1）
        vy: rand(-1, 1),
        r: rand(0.8, 1.9),      // 半径小，克制
        alpha: rand(0.12, 0.4), // 低亮度
        phase: rand(0, Math.PI * 2) // 闪烁相位
      });
    }
  }

  /* ================= 更新：增量时间控制 ================= */
  function update(dt) {
    var move = BASE_SPEED * speedFactor * dt; // 每帧位移量
    var R = REPULSE_RADIUS;
    var i, p, dx, dy, d2, d, f;

    for (i = 0; i < particles.length; i++) {
      p = particles[i];

      // 鼠标轻微排斥 / 扰动
      if (mouse.active) {
        dx = p.x - mouse.x;
        dy = p.y - mouse.y;
        d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) {
          d = Math.sqrt(d2);
          f = (1 - d / R) * REPULSE_FORCE * dt; // 距鼠标越近推得越明显，但整体轻微
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
      }

      // 缓慢漂移
      p.x += p.vx * move;
      p.y += p.vy * move;

      // 边缘软环绕（粒子场无限延伸感）
      if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
      if (p.y < -30) p.y = H + 30; else if (p.y > H + 30) p.y = -30;
    }
  }

  /* ================= 绘制：低亮淡蓝 + 极淡连线 ================= */
  function draw(now) {
    var i, j, p, q, dx, dy, d2, d, k;
    var maxDist = isMobile ? 95 : LINE_DIST; // 移动端连线更短
    var maxAlpha = isMobile ? 0.10 : LINE_ALPHA;

    ctx.clearRect(0, 0, W, H);

    // 1) 距离内淡连接线（仅桌面 & 非减弱动效；数量受控，开销可控）
    if (!reducedMotion) {
      ctx.lineWidth = 1;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        for (j = i + 1; j < particles.length; j++) {
          q = particles[j];
          dx = p.x - q.x; dy = p.y - q.y;
          d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            d = Math.sqrt(d2);
            k = (1 - d / maxDist) * maxAlpha; // 越远越淡
            ctx.strokeStyle = 'rgba(' + COLOR_RGB + ',' + k.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
    }

    // 2) 粒子本体（低亮 + 极轻微呼吸闪烁）
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      var tw = 0.7 + 0.3 * Math.sin(p.phase + now * 0.0012);
      ctx.fillStyle = 'rgba(' + COLOR_RGB + ',' + (p.alpha * tw).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ================= 动画主循环（rAF + 增量时间） ================= */
  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    if (!lastTime) lastTime = now;
    var dt = clamp((now - lastTime) / 16.667, 0.1, 2.5); // 帧率无关，上限防跳变
    lastTime = now;

    // 临时加速到期后自动恢复
    if (boosting && now > boostUntil) {
      speedFactor = 1;
      boosting = false;
    }

    // 减弱动效用户：运动再减半
    if (reducedMotion) dt = Math.min(dt, 0.5);

    update(dt);
    draw(now);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ================= 页面隐藏时暂停 / 恢复 ================= */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (running) {
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }
  });

  /* ================= 鼠标追踪（触屏不扰动） ================= */
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });

  // 鼠标离开页面后停止扰动
  document.documentElement.addEventListener('mouseleave', function () {
    mouse.active = false;
  });

  /* ================= 初始化 ================= */
  // 定位/层级/pointer-events 由 css/style.css 的 #particles 规则负责；
  // 此处仅保留 style.width/height（与 CSS 100% 等价，DPR 下防溢出兜底）。

  window.addEventListener('resize', debounce(resize, 180));
  resize();

  /* ================= 对外 API ================= */
  window.NSParticles = {
    start: start,
    stop: stop,
    /** SECRET MODE：临时加速，到期自动恢复 */
    boost: function (factor, duration) {
      speedFactor = factor || 2;
      boosting = true;
      boostUntil = performance.now() + (duration || 4000);
    },
    /** 立即复位速度（彩蛋自动恢复时调用） */
    setSpeed: function (factor) {
      speedFactor = factor || 1;
      boosting = false;
      boostUntil = 0;
    },
    isRunning: function () { return running; }
  };
})();
