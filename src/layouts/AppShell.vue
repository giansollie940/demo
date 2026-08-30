<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  ChevronsLeft,
  ChevronsRight,
  Sparkles
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'

import SidebarNav from '../components/layout/SidebarNav.vue'
import TopBar from '../components/layout/TopBar.vue'
import WiseOwl from '../components/owl/WiseOwl.vue'

import schoolPatternUrl from '../assets/images/school-pattern-bg.png'

import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'
import { useWeekLifecycle } from '../features/weeks/useWeekLifecycle'

const faviconUrl =
  `${import.meta.env.BASE_URL}assets/images/favicon.png`

const auth = useAuthStore()
const context = useContextStore()
const preferences = usePreferencesStore()
const router = useRouter()

const mobileOpen = ref(false)

watch(
  () => auth.legacyState,
  state => context.hydrate(state),
  { immediate: true }
)

useWeekLifecycle()

async function logout() {
  await auth.logout()

  context.hydrate(null)

  await router.replace('/login')
}
</script>


<template>
  <div
    class="shell"
    :class="{
      collapsed: preferences.sidebarCollapsed
    }"
    :style="{
      '--school-pattern-image':
        `url(${schoolPatternUrl})`
    }"
  >

    <!-- =====================================================
         SIDEBAR
         ===================================================== -->
    <aside
      class="sidebar"
      :class="{ mobileOpen }"
    >

      <!-- HEADER -->
      <div class="side-head">

        <img
          :src="faviconUrl"
          alt=""
        />

        <strong
          v-if="!preferences.sidebarCollapsed"
        >
          SỔ TỰ HỌC
        </strong>

      </div>


      <!-- COLLAPSE / EXPAND -->
      <button
        class="sidebar-edge-toggle"
        type="button"
        :aria-label="
          preferences.sidebarCollapsed
            ? 'Mở rộng thanh điều hướng'
            : 'Thu gọn thanh điều hướng'
        "
        :title="
          preferences.sidebarCollapsed
            ? 'Mở rộng thanh điều hướng'
            : 'Thu gọn thanh điều hướng'
        "
        @click="preferences.toggleSidebar"
      >

        <ChevronsRight
          v-if="preferences.sidebarCollapsed"
        />

        <ChevronsLeft
          v-else
        />

      </button>


      <!-- NAVIGATION -->
      <div class="nav-safe-zone">

        <SidebarNav
          :collapsed="preferences.sidebarCollapsed"
        />

      </div>


      <!-- FOOTER -->
      <div class="side-footer">

        <div
          v-if="!preferences.sidebarCollapsed"
          class="encouragement"
        >
          <Sparkles aria-hidden="true" />

          <span>
            Mỗi tiết tự học là một bước tiến nhỏ.
          </span>
        </div>

      </div>

    </aside>


    <!-- =====================================================
         MOBILE BACKDROP
         ===================================================== -->
    <div
      v-if="mobileOpen"
      class="backdrop"
      @click="mobileOpen = false"
    ></div>


    <!-- =====================================================
         MAIN
         ===================================================== -->
    <div
      class="main"
      :data-loading="
        auth.loading
          ? 'true'
          : undefined
      "
    >

      <TopBar
        @menu="mobileOpen = true"
        @logout="logout"
      />

      <main class="content">
        <RouterView />
      </main>

      <WiseOwl />

    </div>

  </div>
</template>


<style scoped>

/* =========================================================
   APP SHELL
   Nền chung cho SIDEBAR + MAIN
   ========================================================= */

.shell {
  position: relative;

  isolation: isolate;

  min-height: 100vh;

  display: grid;

  grid-template-columns:
    calc(
      var(--sidebar-expanded) + 18px
    )
    minmax(0, 1fr);

  /*
   * Màu nền gốc.
   * Pattern + overlay được đặt ở ::before / ::after.
   */
  background:
    var(--bg);

  transition:
    grid-template-columns
      var(--transition-fast),

    background
      var(--theme-transition),

    color
      var(--theme-transition);
}


.shell.collapsed {
  grid-template-columns:
    calc(
      var(--sidebar-collapsed) + 18px
    )
    minmax(0, 1fr);
}


/* =========================================================
   GLOBAL SCHOOL PATTERN

   QUAN TRỌNG:
   Pattern phủ toàn bộ shell,
   kể cả vùng bên dưới sidebar.
   ========================================================= */

.shell::before {
  content: "";

  position: absolute;

  z-index: 0;

  inset: 0;

  background-image:
    var(--school-pattern-image);

  background-position:
    center top;

  background-size:
    920px auto;

  background-repeat:
    repeat;

  opacity:
    var(--pattern-opacity);

  filter:
    var(--pattern-filter);

  pointer-events:
    none;

  transition:
    filter
      var(--theme-transition);
}


/* =========================================================
   GLOBAL BACKGROUND OVERLAY

   Cũng phủ toàn bộ shell.
   ========================================================= */

.shell::after {
  content: "";

  position: absolute;

  z-index: 0;

  inset: 0;

  background:
    linear-gradient(
      var(--pattern-soft-overlay),
      var(--pattern-soft-overlay)
    ),
    var(--pattern-dark-overlay);

  pointer-events:
    none;

  transition:
    background
      var(--theme-transition),

    opacity
      var(--theme-transition);
}


/* =========================================================
   SIDEBAR ISLAND
   ========================================================= */

.sidebar {
  position: sticky;

  z-index: 40;

  top: 12px;

  width:
    var(--sidebar-expanded);

  /*
   * GIỮ dạng vertical island.
   * Không kéo sidebar xuống hết màn hình.
   */
  height: max-content;

  max-height:
    calc(
      100vh - 24px
    );

  margin:
    0
    0
    0
    12px;

  display: grid;

  grid-template-rows:
    auto
    auto
    auto;

  overflow: visible;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--color-primary) 10%,
      var(--border)
    );

  border-radius:
    26px;

  background:
    linear-gradient(
      180deg,

      color-mix(
        in srgb,
        var(--sidebar) 86%,
        transparent
      ),

      color-mix(
        in srgb,
        var(--wash-peach) 40%,
        color-mix(
          in srgb,
          var(--sidebar) 88%,
          transparent
        )
      )
    );

  backdrop-filter:
    blur(22px)
    saturate(1.18);

  box-shadow:
    0
    20px
    54px
    color-mix(
      in srgb,
      var(--text) 10%,
      transparent
    ),

    0
    8px
    24px
    color-mix(
      in srgb,
      var(--color-primary) 8%,
      transparent
    ),

    inset
    0
    1px
    0
    rgb(255 255 255 / .48);

  transition:
    width
      var(--transition-fast),

    transform
      var(--transition-fast),

    background
      var(--theme-transition),

    border-color
      var(--theme-transition),

    box-shadow
      var(--theme-transition);
}


.shell.collapsed
.sidebar {
  width:
    var(--sidebar-collapsed);
}


.sidebar:hover {
  box-shadow:
    0
    24px
    62px
    color-mix(
      in srgb,
      var(--text) 12%,
      transparent
    ),

    0
    10px
    28px
    color-mix(
      in srgb,
      var(--color-primary) 11%,
      transparent
    ),

    inset
    0
    1px
    0
    rgb(255 255 255 / .56);
}


/* =========================================================
   SIDEBAR HEADER
   ========================================================= */

.side-head {
  position: relative;

  z-index: 30;

  height: 74px;

  display: flex;

  align-items: center;

  gap: 10px;

  padding:
    10px
    12px;

  border-radius:
    25px
    25px
    18px
    18px;

  background:
    linear-gradient(
      110deg,

      color-mix(
        in srgb,
        var(--wash-violet) 88%,
        transparent
      ),

      color-mix(
        in srgb,
        var(--wash-peach) 70%,
        transparent
      )
    );

  transition:
    background
      var(--theme-transition),

    border-color
      var(--theme-transition);
}


.side-head img {
  width: 40px;

  height: 40px;

  filter:
    drop-shadow(
      0
      5px
      10px
      color-mix(
        in srgb,
        var(--color-primary) 16%,
        transparent
      )
    );

  transition:
    transform
      var(--transition-fast),

    filter
      var(--transition-fast);
}


.side-head:hover
img {
  transform:
    translateY(-1px)
    rotate(-2deg)
    scale(1.04);

  filter:
    drop-shadow(
      0
      8px
      14px
      color-mix(
        in srgb,
        var(--color-primary) 24%,
        transparent
      )
    );
}


.side-head strong {
  white-space: nowrap;

  background:
    linear-gradient(
      100deg,
      var(--color-primary),
      var(--color-coral)
    );

  -webkit-background-clip:
    text;

  background-clip:
    text;

  color:
    transparent;

  font-weight:
    900;

  letter-spacing:
    .03em;
}


/* =========================================================
   SIDEBAR EDGE TOGGLE
   ========================================================= */

.sidebar-edge-toggle {
  position:
    absolute;

  z-index:
    65;

  top:
    20px;

  right:
    -17px;

  width:
    34px;

  height:
    34px;

  display:
    grid;

  place-items:
    center;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--color-primary) 22%,
      var(--border)
    );

  border-radius:
    999px;

  background:
    linear-gradient(
      145deg,

      var(--surface),

      color-mix(
        in srgb,
        var(--wash-peach) 74%,
        var(--surface)
      )
    );

  color:
    var(--color-primary);

  box-shadow:
    0
    6px
    18px
    color-mix(
      in srgb,
      var(--color-primary) 14%,
      transparent
    );

  cursor:
    pointer;

  transition:
    transform
      var(--transition-fast),

    box-shadow
      var(--transition-fast),

    border-color
      var(--theme-transition),

    background
      var(--theme-transition),

    color
      var(--theme-transition);
}


.sidebar-edge-toggle
svg {
  width:
    17px;

  height:
    17px;

  transition:
    transform
      var(--transition-fast);
}


.sidebar-edge-toggle:hover {
  transform:
    scale(1.08);

  border-color:
    color-mix(
      in srgb,
      var(--color-primary) 50%,
      var(--border)
    );

  background:
    linear-gradient(
      145deg,

      var(--surface),

      color-mix(
        in srgb,
        var(--wash-violet) 70%,
        var(--surface)
      )
    );

  box-shadow:
    0
    9px
    24px
    color-mix(
      in srgb,
      var(--color-primary) 22%,
      transparent
    );
}


.sidebar-edge-toggle:hover
svg {
  transform:
    translateX(-2px);
}


.shell.collapsed
.sidebar-edge-toggle:hover
svg {
  transform:
    translateX(2px);
}


.sidebar-edge-toggle:active {
  transform:
    scale(.96);
}


/* =========================================================
   NAV SAFE ZONE
   ========================================================= */

.nav-safe-zone {
  position:
    relative;

  z-index:
    1;

  min-height:
    0;

  padding:
    0
    8px
    4px;

  padding-top:
    24px;

  overflow:
    visible;

  display:
    grid;

  align-content:
    start;
}


/* =========================================================
   SIDEBAR FOOTER
   ========================================================= */

.side-footer {
  display:
    grid;

  gap:
    4px;

  padding:
    8px;
}


.encouragement {
  display:
    flex;

  align-items:
    flex-start;

  gap:
    8px;

  margin:
    0
    2px;

  padding:
    10px;

  border-radius:
    13px;

  background:
    linear-gradient(
      135deg,
      var(--wash-cream),
      var(--wash-peach)
    );

  border:
    1px solid
    color-mix(
      in srgb,
      var(--color-sun) 18%,
      var(--border)
    );

  color:
    var(--text-muted);

  font-size:
    var(--font-size-ui-min);

  font-weight:
    750;

  line-height:
    1.35;

  transition:
    background
      var(--theme-transition),

    border-color
      var(--theme-transition),

    color
      var(--theme-transition);
}


.encouragement
svg {
  width:
    16px;

  flex:
    none;

  color:
    var(--color-sun);
}


/* =========================================================
   MAIN

   QUAN TRỌNG:
   Main không còn background riêng.
   Nó nhìn xuyên xuống nền chung của shell.
   ========================================================= */

.main {
  position:
    relative;

  z-index:
    1;

  min-width:
    0;

  min-height:
    100vh;

  overflow:
    hidden;

  background:
    transparent;

  transition:
    color
      var(--theme-transition);
}


/* =========================================================
   CONTENT
   ========================================================= */

.content {
  position:
    relative;

  z-index:
    10;

  padding:
    24px;

  max-width:
    1600px;

  margin:
    0 auto;
}


/* =========================================================
   BACKDROP
   ========================================================= */

.backdrop {
  display:
    none;
}


/* =========================================================
   LOW HEIGHT DESKTOP
   ========================================================= */

@media (
  max-height: 760px
)
and (
  min-width: 761px
) {

  .sidebar {
    height:
      calc(
        100vh - 24px
      );

    grid-template-rows:
      auto
      minmax(0, 1fr)
      auto;
  }


  .nav-safe-zone {
    overflow-y:
      auto;

    overflow-x:
      visible;
  }

}


/* =========================================================
   MOBILE
   ========================================================= */

@media (
  max-width: 760px
) {

  .shell,
  .shell.collapsed {
    display:
      block;
  }


  /*
   * Pattern nhỏ hơn trên mobile.
   */
  .shell::before {
    background-size:
      760px auto;
  }


  .sidebar,
  .shell.collapsed
  .sidebar {
    position:
      fixed;

    left:
      12px;

    top:
      12px;

    width:
      min(
        290px,
        calc(
          86vw - 12px
        )
      );

    height:
      calc(
        100vh - 24px
      );

    margin:
      0;

    transform:
      translateX(
        calc(
          -100% - 24px
        )
      );

    transition:
      transform
        var(--transition-fast),

      background
        var(--theme-transition),

      border-color
        var(--theme-transition),

      box-shadow
        var(--theme-transition);
  }


  .sidebar.mobileOpen {
    transform:
      translateX(0);
  }


  .sidebar-edge-toggle {
    display:
      none;
  }


  .backdrop {
    display:
      block;

    position:
      fixed;

    inset:
      0;

    background:
      var(--overlay);

    z-index:
      30;
  }


  .content {
    padding:
      16px
      12px;
  }

}

</style>