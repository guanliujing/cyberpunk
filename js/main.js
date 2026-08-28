/**
 * main.js — NEURAL SPACE 主页交互逻辑
 * ------------------------------------------------------------------
 * 职责（对应 SPEC 四 / 六 / 七 / 八 / 十 / 十一）：
 *   1. 启动动画：进度条 0→100% → ONLINE 行依次点亮（.boot-line.on）→
 *      #boot-screen.ready 显示 [ ENTER SYSTEM ] → 点击加 .done 淡出、
 *      #page 移除 .page-hidden 并加 .page-visible 展开主页、粒子启动
 *   2. 滚动显现：ENTER 后 body 加 .js-anim（未加时页面完全可见），
 *      IntersectionObserver 给 .statusbar / .section 加 .is-visible
 *   3. 3D Tilt：.tilt[data-tilt] 设置 --rx / --ry（deg），移开复位
 *   4. 光标光晕：#cursor-glow 设置 --gx / --gy（视口坐标 px，CSS 自动居中）
 *   5. SECRET MODE：#secret-trigger 连续点击 5 次 → #secret-overlay.active
 *      显示彩蛋 + body.secret-scan 全页扫描 + 粒子加速 → 数秒后自动恢复
 *   6. 邮箱按钮为原生 mailto 链接（HTML 已带 href），无需 JS
 *
 * 类名契约与 css/style.css 文件头注释一致（css-engineer 已实现）：
 *   body.js-anim / .is-visible / #page.page-hidden→.page-visible /
 *   #boot-screen.ready / .done / .boot-line.on / .tilt --rx --ry /
 *   #cursor-glow --gx --gy / body.touch-device / #secret-overlay.active /
 *   body.secret-scan / body.booted（可选钩子）
 *
 * 零依赖、纯原生 JS、所有元素空值兜底，无控制台报错。
 */
(function () {
  'use strict';

  /* ================= 工具 ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  // 环境降级：减弱动效 / 触屏设备
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (coarse) document.body.classList.add('touch-device');

  /* ================= 元素引用（全部空值兜底） ================= */
  var page = $('#page');
  var glow = $('#cursor-glow');
  var bootScreen = $('#boot-screen');
  var bootFill = $('#boot-fill');
  var bootPct = $('#boot-pct');
  var bootLines = [$('#boot-1'), $('#boot-2'), $('#boot-3'), $('#boot-4')].filter(Boolean);
  var enterBtn = $('#enter-btn');
  var secretTrigger = $('#secret-trigger');
  var secretOverlay = $('#secret-overlay');

  var entered = false; // ENTER 只执行一次

  /* ================= 一、启动动画 ================= */
  var BOOT = {
    progressMs: 2200, // 进度条时长
    lineGap: 380,     // ONLINE 各行点亮间隔
    readyDelay: 260   // 全部行点亮后、显示 ENTER 按钮的延迟
  };

  /** 进度条动画：0 → 100%（easeInOutCubic，帧率无关） */
  function runProgress() {
    var t0 = performance.now();
    function step(now) {
      var t = clamp((now - t0) / BOOT.progressMs, 0, 1);
      var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var pct = Math.round(eased * 100);
      if (bootFill) bootFill.style.width = pct + '%'; // CSS 负责过渡
      if (bootPct) bootPct.textContent = pct + '%';
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        revealBootLines();
      }
    }
    requestAnimationFrame(step);
  }

  /** 依次点亮 ONLINE 行，最后让 #boot-screen.ready 显示 ENTER 按钮 */
  function revealBootLines() {
    var gap = reduced ? 0 : BOOT.lineGap;
    bootLines.slice(1).forEach(function (line, i) {
      setTimeout(function () { line.classList.add('on'); }, i * gap);
    });
    setTimeout(function () {
      if (bootScreen) bootScreen.classList.add('ready');
    }, (bootLines.length - 1) * gap + BOOT.readyDelay);
  }

  /** ENTER：启动界面淡出 → 主页展开 → 粒子出现 → 滚动显现启用 */
  function enterSystem() {
    if (entered) return;
    entered = true;

    // 1) 启动界面淡出（CSS #boot-screen.done）
    bootScreen.classList.add('done');
    setTimeout(function () {
      bootScreen.setAttribute('aria-hidden', 'true');
    }, 800);

    // 2) 主页展开（CSS：移除 .page-hidden 后恢复可见；.page-visible 双保险）
    if (page) {
      page.classList.remove('page-hidden');
      page.classList.add('page-visible');
    }
    document.body.classList.add('booted'); // 可选钩子

    // 3) 粒子出现
    if (window.NSParticles && window.NSParticles.start) window.NSParticles.start();

    // 4) 滚动显现：此时才启用，避免在启动界面背后提前显现
    startReveal();
  }

  /* ================= 二、滚动显现（IntersectionObserver） ================= */
  function startReveal() {
    document.body.classList.add('js-anim');
    var targets = $all('.section').concat($all('.statusbar'));

    // 降级：不支持 IntersectionObserver 时直接全部显现
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible'); // CSS 触发淡入 + 位移
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ================= 三、3D Tilt 卡片 ================= */
  function initTilt() {
    if (coarse || reduced) return; // 触屏 / 减弱动效：CSS 已降级，JS 不再挂监听
    var MAX = 6; // 最大倾斜角度（度），保持轻微

    $all('[data-tilt]').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        // 只设变量：CSS .tilt 自带 perspective + 过渡
        card.style.setProperty('--rx', (-py * MAX).toFixed(2) + 'deg');
        card.style.setProperty('--ry', (px * MAX).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ================= 四、光标淡蓝光晕 ================= */
  function initGlow() {
    if (!glow || coarse || reduced) return; // CSS 已处理触屏隐藏
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      // 只设变量：CSS #cursor-glow 用 calc(var(--gx) - 50%) 自动居中
      glow.style.setProperty('--gx', e.clientX + 'px');
      glow.style.setProperty('--gy', e.clientY + 'px');
    }, { passive: true });
  }

  /* ================= 五、SECRET MODE 彩蛋 ================= */
  var SECRET = {
    clicks: 0,
    last: 0,
    maxGap: 900,  // 两次点击最大间隔(ms)，超过视为重新计数 → “连续”5 次
    need: 5,      // 触发所需连击次数
    holdMs: 5000, // 彩蛋持续时长，之后自动恢复
    timer: null,
    scanTimer: null
  };

  function initSecret() {
    if (!secretTrigger || !secretOverlay) return;
    secretTrigger.addEventListener('click', function () {
      var now = Date.now();
      SECRET.clicks = (now - SECRET.last <= SECRET.maxGap) ? SECRET.clicks + 1 : 1;
      SECRET.last = now;
      if (SECRET.clicks >= SECRET.need) {
        SECRET.clicks = 0;
        activateSecret();
      }
    });
  }

  function activateSecret() {
    if (SECRET.timer) clearTimeout(SECRET.timer);

    // 1) 彩蛋覆盖层（CSS #secret-overlay.active）
    secretOverlay.classList.add('active');
    secretOverlay.setAttribute('aria-hidden', 'false');

    // 2) 全页扫描线：短暂添加 body.secret-scan（CSS ::after 动画约 0.9s）
    if (SECRET.scanTimer) clearTimeout(SECRET.scanTimer);
    document.body.classList.add('secret-scan');
    SECRET.scanTimer = setTimeout(function () {
      document.body.classList.remove('secret-scan');
    }, 950);

    // 3) 粒子短暂加速（particles.js API，到期自动恢复）
    if (window.NSParticles && window.NSParticles.boost) {
      window.NSParticles.boost(2.6, SECRET.holdMs);
    }

    // 4) 数秒后自动恢复
    SECRET.timer = setTimeout(deactivateSecret, SECRET.holdMs);
  }

  function deactivateSecret() {
    SECRET.timer = null;
    secretOverlay.classList.remove('active');
    secretOverlay.setAttribute('aria-hidden', 'true');
    // 粒子速度复位（boost 到期也会自动恢复，双保险）
    if (window.NSParticles && window.NSParticles.setSpeed) window.NSParticles.setSpeed(1);
  }

  /* ================= 初始化 ================= */
  if (!bootScreen) {
    // 结构异常：直接显示主页，避免卡在启动界面
    if (page) {
      page.classList.remove('page-hidden');
      page.classList.add('page-visible');
    }
    if (window.NSParticles && window.NSParticles.start) window.NSParticles.start();
    return;
  }

  initSecret();   // 彩蛋监听（不显眼位置，随时可点）
  initTilt();     // 3D Tilt
  initGlow();     // 光标光晕

  // 启动动画：第 1 行立即点亮；减弱动效用户直接完成进度
  if (bootLines[0]) bootLines[0].classList.add('on');
  if (reduced) {
    if (bootFill) bootFill.style.width = '100%';
    if (bootPct) bootPct.textContent = '100%';
    revealBootLines();
  } else {
    runProgress();
  }

  if (enterBtn) enterBtn.addEventListener('click', enterSystem);
})();
