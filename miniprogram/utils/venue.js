const { createScopedThreejs } = require('../vendor/three')

// Render on interaction instead of running an idle animation loop.
exports.createVenue = function(canvas, width, height, pixelRatio, projects, selectedId, capture = false) {
  const THREE = createScopedThreejs(canvas)
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: capture })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.setClearColor(0xf0eee7)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500)
  const group = new THREE.Group()
  scene.add(group)
  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const sun = new THREE.DirectionalLight(0xffffff, 0.65)
  sun.position.set(10, 20, 8)
  scene.add(sun)
  const geometries = []
  const materials = []
  function box(x, y, z, w, h, d, color) {
    const geometry = new THREE.BoxGeometry(w, h, d)
    const material = new THREE.MeshLambertMaterial({ color })
    geometries.push(geometry)
    materials.push(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }
  box(0, -0.35, 0, 25, 0.7, 23, 0xc6cbb4)
  box(0, 0.04, 0, 2, 0.12, 23, 0xf5e9ce)
  box(0, 0.04, 0, 25, 0.12, 1.8, 0xf5e9ce)
  box(-5, 0.1, -5, 8, 0.25, 7, 0xa9bb88)
  box(5, 0.12, -5, 7, 0.3, 7, 0xd49b73)
  box(5, 0.32, -5, 0.12, 0.05, 6, 0xffedcf)
  box(5, 0.32, -5, 6, 0.05, 0.12, 0xffedcf)
  box(-5, 0.08, 5, 8, 0.16, 7, 0x9dc7cc)
  box(5, 0.1, 5, 7, 0.2, 7, 0xddd0b5)
  box(-10, 1.7, -8, 3, 3.4, 5, 0xe6d8c3)
  box(-10, 3.5, -8, 3.3, 0.3, 5.3, 0xc6875a)
  box(9, 1.2, 8, 3, 2.4, 3, 0xf0e4d1)
  for (let i = 0; i < 7; i++) {
    const x = -10 + i * 3.2
    box(x, 0.55, 10, 0.35, 1.1, 0.35, 0xa07c56)
    box(x, 1.6, 10, 1.5, 1.6, 1.5, i % 2 ? 0x849668 : 0x98a977)
  }
  const coords = [[-5, -5], [5, -5], [-5, 5], [5, 5]]
  const pins = []
  projects.forEach((project, i) => {
    const point = coords[project.spot]
    // Slightly offset projects assigned to the same place, keeping every pin selectable.
    const offset = projects.slice(0, i).filter(p => p.spot === project.spot).length * 0.9
    const pin = box(point[0] + offset, 2.6, point[1], 0.9, 0.9, 0.9, project.id === selectedId ? 0xfa6d20 : 0xffffff)
    box(point[0] + offset, 1.3, point[1], 0.12, 2.6, 0.12, 0xd77236)
    pin.userData.projectId = project.id
    pins.push(pin)
  })
  let angle = 0.65
  // Fit the complete venue horizontally on a tall, full-screen phone canvas.
  const framingScale = Math.max(1, height / width)
  let distance = 38 * framingScale
  function render() { camera.position.set(Math.sin(angle) * distance, distance * 0.85, Math.cos(angle) * distance); camera.lookAt(new THREE.Vector3(0, 0, 0)); renderer.render(scene, camera) }
  render()
  return {
    rotate(delta) { angle += delta; render() },
    zoom(factor) { distance = Math.max(22 * framingScale, Math.min(60 * framingScale, distance * factor)); render() },
    pick(x, y) { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera); const hit = ray.intersectObjects(pins)[0]; return hit ? hit.object.userData.projectId : '' },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose() }
  }
}
