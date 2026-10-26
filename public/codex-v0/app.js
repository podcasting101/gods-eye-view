import * as THREE from '/three/three.module.js';

class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();
    this.enabled = true;
    this.enableDamping = true;
    this.dampingFactor = 0.065;
    this.minDistance = 1;
    this.maxDistance = 35;
    let isDown = false, lx = 0, ly = 0;
    domElement.addEventListener('pointerdown', (e) => { if (!this.enabled) return; isDown = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointerup', () => { isDown = false; });
    window.addEventListener('pointermove', (e) => {
      if (!isDown || !this.enabled) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      const offset = this.camera.position.clone().sub(this.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta -= dx * 0.006;
      sph.phi = Math.max(0.08, Math.min(Math.PI / 2 - 0.04, sph.phi - dy * 0.005));
      offset.setFromSpherical(sph);
      this.camera.position.copy(this.target).add(offset);
    });
    domElement.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      const offset = this.camera.position.clone().sub(this.target);
      const d = Math.max(this.minDistance, Math.min(this.maxDistance, offset.length() * (1 + e.deltaY * 0.001)));
      offset.normalize().multiplyScalar(d);
      this.camera.position.copy(this.target).add(offset);
    }, { passive: true });
  }
  update() {
    this.camera.lookAt(this.target);
  }
}


const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050706);
scene.fog = new THREE.FogExp2(0x050706, 0.036);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.08, 100);
camera.position.set(11, 8, 15);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(0, 1.5, 0);
controls.maxDistance = 35;
controls.minDistance = 1;

scene.add(new THREE.HemisphereLight(0xb5d9cc, 0x090b09, 1.4));
const key = new THREE.DirectionalLight(0xc9ff95, 2.8);
key.position.set(4, 10, 2);
scene.add(key);

// Renderer seam: replace this group with a Gaussian-splat implementation later.
const spatialBase = new THREE.Group();
spatialBase.name = 'spatial-base-renderer-seam';
scene.add(spatialBase);
const grid = new THREE.GridHelper(42, 42, 0x253129, 0x141a16);
grid.material.transparent = true;
grid.material.opacity = 0.48;
spatialBase.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), new THREE.MeshStandardMaterial({ color: 0x090c0a, roughness: 1, metalness: 0.05, transparent: true, opacity: .78 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.012;
spatialBase.add(ground);

const memories = [
  { title:'Arrival', caption:'The threshold where the archive begins.', time:'06:42', stamp:0, p:[-6.2,1.7,4.8], r:[0,.75,0], colors:['#254437','#d6c692'] },
  { title:'Window Light', caption:'Morning geometry, held in dust and glass.', time:'07:18', stamp:14, p:[-3.8,2.2,1.2], r:[-.08,.2,0], colors:['#203d45','#b7e9d3'] },
  { title:'Long Table', caption:'Objects remember the hands that arrange them.', time:'07:41', stamp:27, p:[-1.1,1.6,-2.9], r:[0,-.45,0], colors:['#52382b','#d8aa76'] },
  { title:'Blue Passage', caption:'A corridor folding one moment into the next.', time:'08:03', stamp:39, p:[2.1,2.0,-4.9], r:[.05,-1.15,0], colors:['#1c3548','#71c9c9'] },
  { title:'Garden Index', caption:'The outside world enters as reflected green.', time:'08:46', stamp:52, p:[5.1,1.4,-2.1], r:[-.06,-2.1,0], colors:['#253b25','#a7cf71'] },
  { title:'North Room', caption:'Stillness resolves into a navigable coordinate.', time:'09:27', stamp:66, p:[5.9,2.7,2.2], r:[.1,2.45,0], colors:['#4c3833','#d8b7a1'] },
  { title:'Quiet Signal', caption:'A trace remains after the room is empty.', time:'09:54', stamp:82, p:[2.1,1.8,5.5], r:[-.12,3.05,0], colors:['#393650','#b1a8e5'] },
  { title:'Return', caption:'The path closes, but time remains visible.', time:'10:11', stamp:100, p:[-1.8,2.4,6.4], r:[.05,2.75,0], colors:['#4b4024','#e7d36f'] },
];

const memoryGroup = new THREE.Group();
scene.add(memoryGroup);
const clickable = [];
const nodes = [];
const pathPoints = [];
const makeTexture = (memory, index) => {
  const c = document.createElement('canvas'); c.width = 720; c.height = 480;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,720,480); g.addColorStop(0,memory.colors[0]); g.addColorStop(1,memory.colors[1]); x.fillStyle=g; x.fillRect(0,0,720,480);
  x.globalAlpha=.28; x.fillStyle='#f8f3dd';
  for(let i=0;i<18;i++){ const px=(i*157+index*73)%760-20, py=(i*89+index*41)%520-20; x.fillRect(px,py,80+(i%4)*40,2); }
  x.globalAlpha=.7; x.strokeStyle='#fbf6df'; x.lineWidth=2; x.strokeRect(28,28,664,424);
  x.fillStyle='#fffceb'; x.font='500 14px DM Mono'; x.letterSpacing='3px'; x.fillText(`MEMORY ${String(index+1).padStart(2,'0')}  /  ${memory.time}`,48,60);
  x.globalAlpha=.92; x.font='300 52px Manrope'; x.fillText(memory.title.toUpperCase(),48,405);
  x.globalAlpha=.15; x.fillRect(0,440,720,40);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace; return texture;
};

function frustumGeometry(depth=1.65, width=1.7, height=1.12){
  const pts=[]; const near=.04; const nw=.06, nh=.04; const corners=[[nw,nh,near],[-nw,nh,near],[-nw,-nh,near],[nw,-nh,near],[width/2,height/2,depth],[-width/2,height/2,depth],[-width/2,-height/2,depth],[width/2,-height/2,depth]];
  const pairs=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  pairs.forEach(([a,b])=>pts.push(...corners[a],...corners[b]));
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
}

memories.forEach((memory,index)=>{
  const root=new THREE.Group(); root.position.fromArray(memory.p); root.rotation.set(...memory.r); root.userData={ memory,index };
  const frame=new THREE.LineSegments(frustumGeometry(),new THREE.LineBasicMaterial({color:0xc9ff46,transparent:true,opacity:.28})); root.add(frame);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.12),new THREE.MeshBasicMaterial({map:makeTexture(memory,index),side:THREE.DoubleSide,transparent:true,opacity:.95})); plane.position.z=1.65; plane.userData={ memory,index,root }; root.add(plane); clickable.push(plane);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.065,14,14),new THREE.MeshBasicMaterial({color:0xc9ff46})); root.add(dot);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.1,.12,24),new THREE.MeshBasicMaterial({color:0x75e8d6,transparent:true,opacity:.55,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=-memory.p[1]+.025; root.add(ring);
  memoryGroup.add(root); nodes.push({root,frame,plane,dot,ring,memory,index}); pathPoints.push(new THREE.Vector3(...memory.p));
});

const curve=new THREE.CatmullRomCurve3(pathPoints,false,'centripetal');
const pathLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)),new THREE.LineDashedMaterial({color:0x75e8d6,dashSize:.22,gapSize:.15,transparent:true,opacity:.34}));
pathLine.computeLineDistances(); scene.add(pathLine);

const particlesGeo=new THREE.BufferGeometry(); const particleCount=700; const positions=new Float32Array(particleCount*3);
for(let i=0;i<particleCount;i++){positions[i*3]=(Math.random()-.5)*35;positions[i*3+1]=Math.random()*10;positions[i*3+2]=(Math.random()-.5)*35;}
particlesGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
scene.add(new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:0xaeb9ad,size:.018,transparent:true,opacity:.34})));

const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2(); let hovered=null; let selected=0; let timeline=0; let playing=false; let flight=null;
const $=s=>document.querySelector(s); const range=$('#timeRange');
function setSelected(index, fly=false){
  selected=index; const n=nodes[index],m=n.memory;
  $('#memoryIndex').textContent=`M–${String(index+1).padStart(2,'0')}`; $('#memoryTitle').textContent=m.title; $('#memoryCaption').textContent=m.caption; $('#memoryPosition').textContent=m.p.map(v=>(v<0?'−':'')+Math.abs(v).toFixed(1)).join(' / '); $('#memoryTime').textContent=m.time;
  $('#xValue').textContent=m.p[0].toFixed(1); $('#yValue').textContent=m.p[1].toFixed(1); $('#zValue').textContent=m.p[2].toFixed(1); $('#tValue').textContent=String(m.stamp).padStart(2,'0');
  nodes.forEach((node,i)=>{node.frame.material.color.set(i===index?0xc9ff46:0x6d776e); node.frame.material.opacity=i===index?.85:.25;});
  if(fly) flyTo(index);
}
function flyTo(index){
  const node=nodes[index]; const worldPos=new THREE.Vector3(); node.root.getWorldPosition(worldPos); const direction=new THREE.Vector3(0,0,1).applyQuaternion(node.root.quaternion).normalize();
  flight={start:performance.now(),duration:1400,fromPos:camera.position.clone(),toPos:worldPos.clone().addScaledVector(direction,.22),fromTarget:controls.target.clone(),toTarget:worldPos.clone().addScaledVector(direction,3.2)};
  controls.enabled=false;
}
function setTimeline(value){
  timeline=Number(value); range.style.setProperty('--progress',`${timeline}%`); let visible=0;
  nodes.forEach(n=>{const delta=timeline-n.memory.stamp; const resolved=delta>=-1; n.root.visible=delta>-18; const alpha=THREE.MathUtils.clamp((delta+18)/18,0,1); n.root.scale.setScalar(.82+.18*alpha); n.plane.material.opacity=resolved?.96:.16; n.frame.material.opacity=(n.index===selected?.85:.28)*(.25+.75*alpha); n.dot.material.opacity=.2+.8*alpha; n.dot.material.transparent=true; if(resolved)visible++;});
  const nearest=memories.reduce((best,m,i)=>Math.abs(m.stamp-timeline)<Math.abs(memories[best].stamp-timeline)?i:best,0); if(Math.abs(memories[nearest].stamp-timeline)<8) setSelected(nearest,false);
  $('#visibleCount').textContent=visible; const active=memories[Math.max(0,visible-1)]; $('#dateLabel').textContent=`26 OCT 2026 · ${active.time}`;
}

canvas.addEventListener('pointermove',e=>{pointer.x=e.clientX/innerWidth*2-1;pointer.y=-(e.clientY/innerHeight)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(clickable,false)[0]?.object||null;if(hit!==hovered){hovered=hit;canvas.style.cursor=hit?'pointer':'grab';}});
canvas.addEventListener('click',()=>{if(hovered){setSelected(hovered.userData.index,true); timeline=hovered.userData.memory.stamp; range.value=timeline; setTimeline(timeline);}});
range.addEventListener('input',e=>setTimeline(e.target.value));
$('#enterMemory').addEventListener('click',()=>flyTo(selected));
$('#resetView').addEventListener('click',()=>{flight={start:performance.now(),duration:1200,fromPos:camera.position.clone(),toPos:new THREE.Vector3(11,8,15),fromTarget:controls.target.clone(),toTarget:new THREE.Vector3(0,1.5,0)};controls.enabled=false;});
$('#playButton').addEventListener('click',()=>{playing=!playing;$('#playIcon').textContent=playing?'Ⅱ':'▶';if(timeline>=100){timeline=0;range.value=0;}});

function animate(now){requestAnimationFrame(animate);if(playing){timeline=Math.min(100,timeline+.055);range.value=timeline;setTimeline(timeline);if(timeline>=100){playing=false;$('#playIcon').textContent='▶';}}
  if(flight){const raw=Math.min(1,(now-flight.start)/flight.duration);const t=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;camera.position.lerpVectors(flight.fromPos,flight.toPos,t);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,t);if(raw===1){flight=null;controls.enabled=true;}}
  nodes.forEach((n,i)=>{n.ring.rotation.z=now*.0002+i;n.dot.scale.setScalar(1+Math.sin(now*.002+i)*.18);}); controls.update(); renderer.render(scene,camera);
}
setSelected(0); setTimeline(0); requestAnimationFrame(animate);
setTimeout(()=>$('#loading').classList.add('hidden'),650);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
