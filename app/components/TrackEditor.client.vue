<script setup lang="ts">
import type { TresContext } from '@tresjs/core'
import { ACESFilmicToneMapping, OrthographicCamera } from 'three'
import { TrackEditorRuntime, type EditorTool } from '../game/TrackEditorRuntime'

const route = useRoute()
const mainCamera = shallowRef(new OrthographicCamera(-30, 30, 30, -30, 0.1, 200))

const loading = ref(true)
const fatalError = ref('')
const tool = ref<EditorTool>('road')
const toast = ref('')
const toastVisible = ref(false)

let toastTimer: ReturnType<typeof window.setTimeout> | undefined
let editor: TrackEditorRuntime | null = null

function getMapParam() {
  const value = route.query.map
  return typeof value === 'string' ? value : null
}

function showToast(message: string) {
  toast.value = message
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

function selectTool(nextTool: 'road' | 'erase') {
  tool.value = nextTool
  editor?.selectTool(nextTool)
}

async function playTrack() {
  editor?.playTrack()
}

async function shareTrack() {
  await editor?.shareTrack()
}

function clearTrack() {
  editor?.clearAll()
  showToast('Track cleared')
}

async function handleReady(context: TresContext) {
  if (editor) {
    return
  }

  fatalError.value = ''

  try {
    const canvas = context.renderer.instance.domElement
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('TresJS editor canvas is unavailable.')
    }

    editor = new TrackEditorRuntime({
      scene: context.scene.value,
      camera: context.camera.activeCamera.value || mainCamera.value,
      canvas,
      initialMap: getMapParam(),
      showToast,
    })

    await editor.init()
    editor.selectTool(tool.value)
    loading.value = false
  }
  catch (error) {
    console.error(error)
    fatalError.value = error instanceof Error ? error.message : 'Editor failed to initialize.'
    loading.value = false
  }
}

onUnmounted(() => {
  clearTimeout(toastTimer)
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div class="editor-shell">
    <TresCanvas
      window-size
      :camera="mainCamera"
      :dpr="[1, 2]"
      clear-color="#adb2ba"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1"
      :shadows="true"
      :antialias="true"
      render-mode="always"
      @ready="handleReady"
    />

    <nav class="editor-toolbar">
      <button :class="{ active: tool === 'road' }" @click="selectTool('road')">
        Road
      </button>
      <button :class="{ active: tool === 'erase' }" @click="selectTool('erase')">
        Erase
      </button>
      <div class="separator" />
      <button class="action" @click="playTrack">
        Play
      </button>
      <button class="action" @click="shareTrack">
        Share
      </button>
      <div class="separator" />
      <button class="danger" @click="clearTrack">
        Clear
      </button>
    </nav>

    <div v-if="toast" :class="['editor-toast', { show: toastVisible }]">
      {{ toast }}
    </div>

    <div v-if="loading" class="editor-overlay">
      <div class="editor-card">
        <p>Track Editor</p>
        <h1>正在装载编辑器与赛道模块</h1>
        <span>左键绘制，右键擦除，空格拖拽，双指可平移和缩放。</span>
      </div>
    </div>

    <div v-if="fatalError" class="editor-overlay">
      <div class="editor-card">
        <p>Runtime Error</p>
        <h1>编辑器初始化失败</h1>
        <span>{{ fatalError }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-shell {
  position: fixed;
  inset: 0;
}

.editor-toolbar {
  position: absolute;
  left: 50%;
  bottom: 1.25rem;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.38rem;
  padding: 0.55rem 0.7rem;
  transform: translateX(-50%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.95rem;
  background: rgba(20, 20, 30, 0.85);
  backdrop-filter: blur(12px);
  box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.36);
}

.editor-toolbar button {
  appearance: none;
  padding: 0.5rem 0.9rem;
  border: 0;
  border-radius: 0.65rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.editor-toolbar button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.editor-toolbar button.active {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.editor-toolbar button.action {
  background: rgba(80, 180, 80, 0.25);
  color: rgba(140, 255, 140, 0.92);
}

.editor-toolbar button.action:hover {
  background: rgba(80, 180, 80, 0.4);
  color: #fff;
}

.editor-toolbar button.danger {
  color: rgba(255, 255, 255, 0.48);
}

.editor-toolbar button.danger:hover {
  background: rgba(220, 80, 80, 0.25);
  color: rgba(255, 140, 140, 0.95);
}

.separator {
  width: 1px;
  height: 1.45rem;
  background: rgba(255, 255, 255, 0.15);
}

.editor-toast {
  position: absolute;
  left: 50%;
  bottom: 5.5rem;
  z-index: 21;
  padding: 0.75rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  background: rgba(20, 20, 30, 0.85);
  color: #fff;
  font-size: 0.82rem;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 180ms ease;
  pointer-events: none;
}

.editor-toast.show {
  opacity: 1;
}

.editor-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: radial-gradient(circle at top, rgba(173, 178, 186, 0.18), rgba(0, 0, 0, 0.82));
}

.editor-card {
  width: min(32rem, 100%);
  padding: 1.4rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 1.15rem;
  background: rgba(10, 10, 10, 0.72);
  backdrop-filter: blur(18px);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.4);
}

.editor-card p {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
}

.editor-card h1 {
  margin: 0.2rem 0 0.45rem;
  font-size: clamp(1.2rem, 2vw, 1.65rem);
  line-height: 1.05;
}

.editor-card span {
  display: block;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.94rem;
}

@media (max-width: 720px) {
  .editor-toolbar {
    gap: 0.22rem;
    padding: 0.45rem 0.5rem;
    bottom: 1rem;
    width: calc(100vw - 1rem);
    justify-content: center;
  }

  .editor-toolbar button {
    padding: 0.5rem 0.72rem;
    font-size: 0.78rem;
  }

  .editor-toast {
    bottom: 5rem;
    width: calc(100vw - 2rem);
    text-align: center;
  }
}
</style>
