// 孩子的头：在看哪里、有没有安静下来、头往哪边歪。头显里读 XR 相机，桌面上读普通相机（鼠标拖动转头）。
// 所有位置/方向都换算到 world 组本地坐标（和场景里的东西同一套坐标，重新居中后也对）。
import * as THREE from 'three';
import { DEG } from './util.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();

export class Head {
  constructor(renderer, camera, world) {
    this.renderer = renderer; this.camera = camera; this.world = world;
    this.pos = new THREE.Vector3(0, 1.1, 0);
    this.dir = new THREE.Vector3(0, 0, -1);
    this.quat = new THREE.Quaternion();
    this.yaw = 0; this.pitch = 0; this.roll = 0;   // 度：yaw 左正右负，pitch 抬头为正，roll 左耳朝下为正
    this.speed = 0;                                 // 转头角速度（度/秒，平滑过）
    this._prevDir = null;
  }
  update(dt) {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_p); cam.getWorldQuaternion(_q);
    this.world.updateMatrixWorld();
    this.pos.copy(this.world.worldToLocal(_p));
    this.world.getWorldQuaternion(_wq).invert();
    this.quat.copy(_wq).multiply(_q);
    this.dir.set(0, 0, -1).applyQuaternion(this.quat);
    _e.setFromQuaternion(this.quat, 'YXZ');
    this.yaw = _e.y / DEG; this.pitch = _e.x / DEG; this.roll = _e.z / DEG;
    if (this._prevDir && dt > 0) {
      const a = this._prevDir.angleTo(this.dir) / DEG / dt;
      this.speed += (a - this.speed) * Math.min(1, dt / 0.35);
    }
    (this._prevDir ||= new THREE.Vector3()).copy(this.dir);
  }
  /** 视线和“看向 target”之间的夹角（度） */
  angleTo(target) { return _v.copy(target).sub(this.pos).angleTo(this.dir) / DEG; }
  /** 头前方某处（米）：forward 向前、down 向下、right 向右（跟着头转） */
  local(forward = 0, down = 0, right = 0, out = new THREE.Vector3()) {
    out.set(right, -down, -forward).applyQuaternion(this.quat).add(this.pos);
    return out;
  }
}
