import { FrontSide, Mesh } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { LoadedModels, ModelName } from './Track'

const MODEL_NAMES: ModelName[] = [
  'vehicle-truck-yellow',
  'vehicle-truck-green',
  'vehicle-truck-purple',
  'vehicle-truck-red',
  'track-straight',
  'track-corner',
  'track-bump',
  'track-finish',
  'decoration-empty',
  'decoration-forest',
  'decoration-tents',
]

let modelsPromise: Promise<LoadedModels> | null = null

export function loadModels(): Promise<LoadedModels> {
  if (modelsPromise) {
    return modelsPromise
  }

  const loader = new GLTFLoader()

  modelsPromise = Promise.all(
    MODEL_NAMES.map((name) => new Promise<[ModelName, GLTF['scene']]>((resolve, reject) => {
      loader.load(
        `/models/${name}.glb`,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
              child.material.side = FrontSide
            }
          })

          if (name.startsWith('vehicle-')) {
            gltf.scene.scale.setScalar(0.5)
          }

          resolve([name, gltf.scene])
        },
        undefined,
        (error) => {
          reject(error)
        },
      )
    })),
  ).then((entries) => Object.fromEntries(entries) as LoadedModels)

  return modelsPromise
}
