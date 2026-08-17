'use strict'

/**
 * System resource monitor for the desktop pet. CPU is computed as a delta
 * between two os.cpus() samples (there is no instantaneous OS API), memory
 * comes straight from Electron's process.getSystemMemoryInfo(), and
 * per-process CPU aggregates app.getAppMetrics(). Pure Node + Electron main
 * process — no renderer involvement.
 */

const os = require('node:os')
const { app } = require('electron')

function sampleCpu() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const c of cpus) {
    idle += c.times.idle
    for (const key of Object.keys(c.times)) total += c.times[key]
  }
  return { idle, total }
}

function clampPct(v) {
  return Math.round(Math.max(0, Math.min(100, v)))
}

class StatsMonitor {
  constructor() {
    this._prev = sampleCpu()
  }

  /** One snapshot: system CPU %, system RAM %, process CPU %, byte totals. */
  read() {
    const cpu = sampleCpu()
    const idleDelta = cpu.idle - this._prev.idle
    const totalDelta = cpu.total - this._prev.total
    this._prev = cpu
    const cpuPct = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0

    // getSystemMemoryInfo returns kilobytes on all platforms.
    const mem = process.getSystemMemoryInfo()
    const usedKb = Math.max(0, (mem.total || 0) - (mem.free || 0))
    const memPct = mem.total ? (usedKb / mem.total) * 100 : 0

    let procCpu = 0
    try {
      procCpu = app.getAppMetrics().reduce((a, m) => a + (m.cpu.percentCPUUsage || 0), 0)
    } catch (err) { /* getAppMetrics only valid after ready */ }

    return {
      cpu: clampPct(cpuPct),
      mem: clampPct(memPct),
      procCpu: clampPct(procCpu),
      memUsedGb: +(usedKb / 1024 / 1024).toFixed(1),
      memTotalGb: +((mem.total || 0) / 1024 / 1024).toFixed(1),
      ts: Date.now(),
    }
  }
}

module.exports = { StatsMonitor }
