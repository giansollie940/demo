<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'

import {
  Building2,
  CalendarClock,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardCheck,
  GraduationCap,
  History,
  LayoutDashboard,
  MessagesSquare,
  NotebookPen,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UsersRound
} from 'lucide-vue-next'

import { useAuthStore } from '../../stores/auth'
import { visibleNavigation } from '../../features/navigation/navigation'

const props = defineProps<{
  collapsed: boolean
}>()

const route = useRoute()
const auth = useAuthStore()

const hoveredIndex = ref<number | null>(null)

const icons: Record<string, Component> = {
  LayoutDashboard,
  NotebookPen,
  ClipboardCheck,
  UsersRound,
  CalendarRange,
  CalendarClock,
  GraduationCap,
  ChartNoAxesCombined,
  History,
  MessagesSquare,
  ShieldCheck,
  TriangleAlert,
  Settings,
  Building2
}

const items = computed(() =>
  visibleNavigation(auth.currentUser?.role)
)

/* =========================================================
   DOCK SCALE

   Giữ hiệu ứng phóng to kiểu dock.
   ========================================================= */

function dockScale(index: number) {
  if (hoveredIndex.value === null) return 1

  const distance = Math.abs(
    hoveredIndex.value - index
  )

  if (distance === 0) {
    return props.collapsed ? 1.18 : 1.075
  }

  if (distance === 1) {
    return props.collapsed ? .965 : .985
  }

  if (distance === 2) {
    return props.collapsed ? .945 : .975
  }

  return props.collapsed ? .925 : .985
}


/* =========================================================
   DOCK VERTICAL SHIFT
   ========================================================= */

function dockShift(index: number) {
  if (
    hoveredIndex.value === null ||
    hoveredIndex.value === index
  ) {
    return 0
  }

  const delta =
    index - hoveredIndex.value

  const direction =
    delta < 0 ? -1 : 1

  const distance =
    Math.abs(delta)

  if (distance === 1) {
    return direction *
      (props.collapsed ? 10 : 7)
  }

  if (distance === 2) {
    return direction *
      (props.collapsed ? 4 : 3)
  }

  return 0
}


/* =========================================================
   DOCK GAP
   ========================================================= */

function dockGap(index: number) {
  if (hoveredIndex.value === null) {
    return {
      before: 0,
      after: 0
    }
  }

  const distance =
    Math.abs(
      hoveredIndex.value - index
    )

  if (distance === 0) {
    return {
      before: props.collapsed ? 7 : 4,
      after: props.collapsed ? 7 : 4
    }
  }

  if (distance === 1) {
    return {
      before: props.collapsed ? 2 : 1,
      after: props.collapsed ? 2 : 1
    }
  }

  return {
    before: 0,
    after: 0
  }
}


/* =========================================================
   HORIZONTAL LIFT

   QUAN TRỌNG:
   - Expanded: giữ hiệu ứng dịch nhẹ sang phải.
   - Collapsed: KHÔNG dịch ngang.
   ========================================================= */

function dockLiftX(index: number) {
  if (hoveredIndex.value !== index) {
    return 0
  }

  /*
   * Sidebar collapsed phải luôn giữ
   * trục giữa cố định.
   */
  if (props.collapsed) {
    return 0
  }

  return 10
}
</script>


<template>
  <nav
    class="side-nav"
    :class="{ collapsed }"
    aria-label="Điều hướng chính"
    @mouseleave="hoveredIndex = null"
  >

    <RouterLink
      v-for="(item, index) in items"
      :key="`${item.to}-${item.label}`"
      :to="item.to"
      class="nav-item"

      :class="{
        active:
          route.fullPath === item.to ||
          (
            route.path === item.to &&
            !item.to.includes('?')
          )
      }"

      :style="{
        '--dock-scale':
          String(dockScale(index)),

        '--dock-shift-y':
          `${dockShift(index)}px`,

        '--dock-lift-x':
          `${dockLiftX(index)}px`,

        '--dock-gap-before':
          `${dockGap(index).before}px`,

        '--dock-gap-after':
          `${dockGap(index).after}px`
      }"

      :aria-label="
        collapsed
          ? item.label
          : undefined
      "

      @mouseenter="hoveredIndex = index"
      @focus="hoveredIndex = index"
      @blur="hoveredIndex = null"
    >

      <span class="nav-icon-bubble">
        <component :is="icons[item.icon]" />
      </span>

      <span
        v-if="!collapsed"
        class="nav-label"
      >
        {{ item.label }}
      </span>

      <span
        v-if="collapsed"
        class="nav-tooltip"
        role="tooltip"
      >
        {{ item.label }}
      </span>

    </RouterLink>

  </nav>
</template>


<style scoped>

/* =========================================================
   NAV CONTAINER
   ========================================================= */

.side-nav {
  display: grid;

  align-content: start;

  gap: 7px;

  padding:
    12px
    9px
    18px;

  overflow: visible;

  perspective: 900px;
}


/* =========================================================
   NAV ITEM
   ========================================================= */

.nav-item {
  --nav-accent:
    var(--color-primary);

  --dock-scale: 1;

  --dock-shift-y: 0px;

  --dock-lift-x: 0px;

  --dock-gap-before: 0px;

  --dock-gap-after: 0px;


  position: relative;

  z-index: 1;

  isolation: isolate;

  overflow: visible;


  min-height: 48px;


  display: flex;

  align-items: center;

  gap: 10px;


  margin-top:
    var(--dock-gap-before);

  margin-bottom:
    var(--dock-gap-after);


  padding:
    5px
    11px
    5px
    6px;


  border:
    1px solid
    color-mix(
      in srgb,
      var(--nav-accent) 8%,
      var(--border)
    );


  border-radius: 17px;


  background:
    color-mix(
      in srgb,
      var(--surface) 72%,
      transparent
    );


  color:
    var(--text-muted);


  font-size: .91rem;

  font-weight: 780;


  box-shadow:
    0
    5px
    14px
    rgb(79 55 73 / .035);


  transform:
    translateY(
      var(--dock-shift-y)
    )
    translateX(
      var(--dock-lift-x)
    )
    scale(
      var(--dock-scale)
    );


  /*
   * Expanded vẫn có cảm giác
   * bung ra từ trái.
   */
  transform-origin:
    left center;


  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    transform .3s
      cubic-bezier(
        .2,
        1.5,
        .35,
        1
      ),
    margin .3s
      cubic-bezier(
        .2,
        1.5,
        .35,
        1
      ),
    border-color var(--transition-fast),
    box-shadow .3s
      cubic-bezier(
        .2,
        1.5,
        .35,
        1
      );


  will-change:
    transform,
    margin;
}


/* =========================================================
   COLOR ACCENTS
   ========================================================= */

.nav-item:nth-child(2) {
  --nav-accent:
    var(--color-coral);
}

.nav-item:nth-child(3) {
  --nav-accent:
    var(--color-sun);
}

.nav-item:nth-child(4) {
  --nav-accent:
    var(--color-mint);
}

.nav-item:nth-child(5) {
  --nav-accent:
    var(--color-lilac);
}

.nav-item:nth-child(6) {
  --nav-accent:
    var(--color-pink);
}

.nav-item:nth-child(7) {
  --nav-accent:
    var(--color-coral);
}

.nav-item:nth-child(8) {
  --nav-accent:
    var(--color-sun);
}

.nav-item:nth-child(9) {
  --nav-accent:
    var(--color-mint);
}

.nav-item:nth-child(10) {
  --nav-accent:
    var(--color-lilac);
}

.nav-item:nth-child(11) {
  --nav-accent:
    var(--color-pink);
}

.nav-item:nth-child(12) {
  --nav-accent:
    var(--color-coral);
}

.nav-item:nth-child(13) {
  --nav-accent:
    var(--color-sun);
}


/* =========================================================
   ICON BUBBLE
   ========================================================= */

.nav-icon-bubble {
  position: relative;

  isolation: isolate;


  width: 36px;

  height: 36px;


  display: grid;

  place-items: center;


  flex:
    0
    0
    36px;


  border-radius: 13px;


  background:
    linear-gradient(
      145deg,

      color-mix(
        in srgb,
        var(--wash-cream) 76%,
        var(--surface)
      ),

      color-mix(
        in srgb,
        var(--nav-accent) 10%,
        var(--surface)
      )
    );


  box-shadow:
    inset
    0
    0
    0
    1px
    color-mix(
      in srgb,
      var(--nav-accent) 13%,
      var(--border)
    );


  transition:
    transform .28s
      cubic-bezier(
        .2,
        1.5,
        .35,
        1
      ),
    box-shadow var(--transition-fast),
    background var(--theme-transition);
}


.nav-icon-bubble::before {
  content: "";

  position: absolute;

  z-index: -1;


  inset: -3px;


  border-radius: 16px;


  background:
    conic-gradient(
      from 0deg,

      var(--color-primary),
      var(--color-coral),
      var(--color-sun),
      var(--color-lilac),
      var(--color-primary)
    );


  opacity: 0;

  transform:
    rotate(0deg);


  transition:
    opacity
    var(--transition-fast);


  -webkit-mask:
    linear-gradient(#000 0 0)
      content-box,
    linear-gradient(#000 0 0);

  mask:
    linear-gradient(#000 0 0)
      content-box,
    linear-gradient(#000 0 0);


  padding: 2px;


  -webkit-mask-composite:
    xor;

  mask-composite:
    exclude;
}


/* =========================================================
   HOVER RING
   ========================================================= */

.nav-item:hover
.nav-icon-bubble::before,

.nav-item:focus-visible
.nav-icon-bubble::before {
  opacity: 1;

  animation:
    nav-ring-spin
    .62s
    var(--ease-out)
    1;
}


/* =========================================================
   HOVER ITEM
   ========================================================= */

.nav-item:hover,
.nav-item:focus-visible {
  z-index: 8;


  background:
    linear-gradient(
      105deg,

      color-mix(
        in srgb,
        var(--wash-peach) 66%,
        var(--surface)
      ),

      color-mix(
        in srgb,
        var(--nav-accent) 10%,
        var(--surface)
      )
    );


  border-color:
    color-mix(
      in srgb,
      var(--nav-accent) 28%,
      var(--border)
    );


  color:
    var(--nav-accent);


  box-shadow:
    0
    17px
    36px
    color-mix(
      in srgb,
      var(--nav-accent) 16%,
      transparent
    ),

    0
    6px
    13px
    rgb(67 45 57 / .08);
}


.nav-item:hover
.nav-icon-bubble,

.nav-item:focus-visible
.nav-icon-bubble {
  transform:
    scale(1.06);


  box-shadow:
    0
    9px
    18px
    color-mix(
      in srgb,
      var(--nav-accent) 18%,
      transparent
    );
}


/* =========================================================
   ACTIVE
   ========================================================= */

.nav-item.active {
  background:
    linear-gradient(
      105deg,

      color-mix(
        in srgb,
        var(--wash-peach) 80%,
        var(--surface)
      ),

      color-mix(
        in srgb,
        var(--wash-violet) 52%,
        var(--surface)
      )
    );


  border-color:
    color-mix(
      in srgb,
      var(--nav-accent) 24%,
      var(--border)
    );


  color:
    var(--nav-accent);


  box-shadow:
    0
    7px
    18px
    color-mix(
      in srgb,
      var(--nav-accent) 9%,
      transparent
    );
}


.nav-item.active
.nav-icon-bubble {
  background:
    linear-gradient(
      145deg,

      color-mix(
        in srgb,
        var(--wash-peach) 80%,
        var(--surface)
      ),

      color-mix(
        in srgb,
        var(--nav-accent) 15%,
        var(--surface)
      )
    );


  box-shadow:
    inset
    0
    0
    0
    1px
    color-mix(
      in srgb,
      var(--nav-accent) 24%,
      var(--border)
    ),

    0
    5px
    12px
    color-mix(
      in srgb,
      var(--nav-accent) 10%,
      transparent
    );
}


/* =========================================================
   SVG
   ========================================================= */

.nav-icon-bubble :deep(svg) {
  width: 18px;

  height: 18px;

  stroke:
    currentColor;


  transition:
    transform .28s
      cubic-bezier(
        .2,
        1.5,
        .35,
        1
      ),

    filter
    var(--transition-fast);
}


.nav-item:hover
.nav-icon-bubble :deep(svg),

.nav-item:focus-visible
.nav-icon-bubble :deep(svg) {
  transform:
    scale(1.08);


  filter:
    drop-shadow(
      0
      3px
      6px
      color-mix(
        in srgb,
        var(--nav-accent) 20%,
        transparent
      )
    );
}


/* =========================================================
   LABEL
   ========================================================= */

.nav-label {
  white-space: nowrap;

  overflow: hidden;

  text-overflow: ellipsis;
}


/* =========================================================
   COLLAPSED
   QUAN TRỌNG: khóa trục giữa.
   ========================================================= */

.collapsed {
  padding-inline: 8px;

  gap: 8px;
}


.collapsed .nav-item {
  /*
   * Mỗi item chiếm toàn bộ chiều ngang
   * khả dụng và tự căn giữa.
   */
  width: 100%;

  box-sizing: border-box;


  justify-content: center;


  min-height: 48px;


  padding: 5px;


  margin-left: 0;

  margin-right: 0;


  border-radius: 17px;


  background:
    color-mix(
      in srgb,
      var(--surface) 68%,
      transparent
    );


  /*
   * QUAN TRỌNG:
   * scale từ chính giữa,
   * không scale từ mép trái.
   */
  transform-origin:
    center center;
}


.collapsed
.nav-icon-bubble {
  width: 38px;

  height: 38px;

  flex-basis: 38px;

  border-radius: 14px;
}


.collapsed
.nav-item:hover,

.collapsed
.nav-item:focus-visible {
  box-shadow:
    0
    19px
    38px
    color-mix(
      in srgb,
      var(--nav-accent) 18%,
      transparent
    ),

    0
    7px
    16px
    rgb(67 45 57 / .11);
}


/* =========================================================
   TOOLTIP
   ========================================================= */

.nav-tooltip {
  position: absolute;

  z-index: 100;


  left:
    calc(
      100% + 11px
    );

  top: 50%;


  padding:
    7px
    10px;


  border:
    1px solid
    var(--border);


  border-radius: 10px;


  background:
    var(--surface-raised);


  color:
    var(--text);


  font-size:
    var(--font-size-ui-min);


  font-weight: 800;


  white-space: nowrap;


  box-shadow:
    var(--shadow-sm);


  opacity: 0;


  pointer-events: none;


  transform:
    translate(
      5px,
      -50%
    )
    scale(.97);


  transition:
    opacity
      var(--transition-fast),

    transform
      var(--transition-fast),

    background
      var(--theme-transition),

    color
      var(--theme-transition),

    border-color
      var(--theme-transition);
}


.collapsed
.nav-item:hover
.nav-tooltip,

.collapsed
.nav-item:focus-visible
.nav-tooltip {
  opacity: 1;


  transform:
    translate(
      0,
      -50%
    )
    scale(1);
}


/* =========================================================
   ANIMATION
   ========================================================= */

@keyframes nav-ring-spin {
  from {
    transform:
      rotate(0deg);
  }

  to {
    transform:
      rotate(360deg);
  }
}


/* =========================================================
   SHORT HEIGHT
   ========================================================= */

@media (max-height: 760px) {

  .side-nav {
    overflow-y: auto;

    overflow-x: hidden;

    overscroll-behavior:
      contain;

    scrollbar-width: thin;
  }


  .nav-item {
    --dock-scale:
      1 !important;

    --dock-shift-y:
      0px !important;

    --dock-lift-x:
      0px !important;

    --dock-gap-before:
      0px !important;

    --dock-gap-after:
      0px !important;


    transform:
      none !important;


    margin-top:
      0 !important;

    margin-bottom:
      0 !important;
  }


  /*
   * Expanded:
   * vẫn có hover nhẹ.
   */
  .nav-item:hover,
  .nav-item:focus-visible {
    transform:
      translateX(4px)
      !important;
  }


  /*
   * Collapsed:
   * tuyệt đối không dịch ngang.
   */
  .collapsed
  .nav-item:hover,

  .collapsed
  .nav-item:focus-visible {
    transform:
      none !important;
  }
}


/* =========================================================
   REDUCED MOTION
   ========================================================= */

@media (
  prefers-reduced-motion:
  reduce
) {

  .nav-item {
    --dock-scale:
      1 !important;

    --dock-shift-y:
      0px !important;

    --dock-lift-x:
      0px !important;

    --dock-gap-before:
      0px !important;

    --dock-gap-after:
      0px !important;
  }


  .nav-item,
  .nav-icon-bubble,
  .nav-icon-bubble::before,
  .nav-icon-bubble :deep(svg),
  .nav-tooltip {
    transition:
      none !important;

    animation:
      none !important;
  }


  .nav-item:hover,
  .nav-item:focus-visible,

  .collapsed
  .nav-item:hover,

  .collapsed
  .nav-item:focus-visible {
    transform:
      none !important;

    margin-top:
      0 !important;

    margin-bottom:
      0 !important;
  }
}

</style>