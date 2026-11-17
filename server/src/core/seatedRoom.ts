import { randomUUID } from 'node:crypto';
import type { Namespace } from 'socket.io';
import type { PlayerRole, SessionInfo } from '../../../shared/types';

export interface PlayerInternal {
  id: string;
  token: string;
  name: string;
  role: PlayerRole;
  socketId: string | null;
  connected: boolean;
  graceTimer: NodeJS.Timeout | null;
  wantsRematch: boolean;
}

export const ROLES: readonly PlayerRole[] = ['A', 'B'];

/**
 * Seat management shared by every 2-player game:
 * joining, per-tab sessions, the reconnect grace period and host promotion.
 * Game rules live in subclasses, which react through the protected hooks.
 */
export abstract class SeatedRoom<Snapshot> {
  readonly players: Partial<Record<PlayerRole, PlayerInternal>> = {};
  protected destroyed = false;

  constructor(
    readonly code: string,
    protected readonly nsp: Namespace,
    protected readonly reconnectGraceMs: number,
    private readonly onEmpty: () => void,
  ) {}

  // ---------------------------------------------------------------- hooks

  /** True while a fresh player may take the free seat. */
  abstract acceptsNewPlayer(): boolean;
  abstract snapshotFor(role: PlayerRole): Snapshot;
  /** Second seat filled (e.g. WAITING_FOR_PLAYERS → LOBBY). */
  protected abstract onRoomFilled(): void;
  /** A player dropped; their seat is held for the grace period (pause timers here). */
  protected abstract onPlayerDropped(player: PlayerInternal): void;
  /** A dropped player came back (resume timers here). */
  protected abstract onPlayerBack(player: PlayerInternal): void;
  /** A player left for good; one player remains and has become the host. Reset the game. */
  protected abstract onPlayerGone(): void;
  /** Clear every game timer. */
  protected abstract onDestroy(): void;

  // ---------------------------------------------------------------- seats

  isFull(): boolean {
    return Boolean(this.players.A && this.players.B);
  }

  allConnected(): boolean {
    return Boolean(this.players.A?.connected && this.players.B?.connected);
  }

  findPlayer(playerId: string): PlayerInternal | undefined {
    return ROLES.map((r) => this.players[r]).find((p) => p?.id === playerId);
  }

  sessionFor(player: PlayerInternal): SessionInfo {
    return { roomCode: this.code, playerId: player.id, token: player.token };
  }

  addPlayer(name: string, socketId: string): PlayerInternal {
    const role: PlayerRole = this.players.A ? 'B' : 'A';
    const player: PlayerInternal = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      role,
      socketId,
      connected: true,
      graceTimer: null,
      wantsRematch: false,
    };
    this.players[role] = player;
    if (this.isFull()) this.onRoomFilled();
    if (role === 'B') this.emitRaw('player_joined', { name, role, reconnected: false });
    this.broadcast();
    return player;
  }

  /** Re-attach a player who reconnected on a new socket. Returns the replaced socket id, if any. */
  reattach(player: PlayerInternal, socketId: string): string | null {
    const previous = player.socketId && player.socketId !== socketId ? player.socketId : null;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    const wasDisconnected = !player.connected;
    player.socketId = socketId;
    player.connected = true;
    if (wasDisconnected) {
      this.emitRaw('player_joined', { name: player.name, role: player.role, reconnected: true });
      this.onPlayerBack(player);
    }
    this.broadcast();
    return previous;
  }

  handleDisconnect(player: PlayerInternal, socketId: string): void {
    if (player.socketId !== socketId) return; // an old, already-replaced socket
    player.socketId = null;
    player.connected = false;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = setTimeout(() => this.removePlayer(player.role), this.reconnectGraceMs);
    this.emitRaw('player_left', {
      name: player.name,
      role: player.role,
      reason: 'disconnected',
      graceMs: this.reconnectGraceMs,
    });
    this.onPlayerDropped(player);
    this.broadcast();
  }

  /** Remove a player for good (left on purpose or did not come back in time). */
  removePlayer(role: PlayerRole): void {
    const player = this.players[role];
    if (!player || this.destroyed) return;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    delete this.players[role];

    const remaining = this.players.A ?? this.players.B;
    if (!remaining) {
      this.destroy();
      this.onEmpty();
      return;
    }
    // The remaining player becomes (or stays) the host.
    if (remaining.role === 'B') {
      delete this.players.B;
      remaining.role = 'A';
      this.players.A = remaining;
    }
    remaining.wantsRematch = false;
    this.onPlayerGone();
    this.emitRaw('player_left', { name: player.name, role, reason: 'left' });
    this.broadcast();
  }

  destroy(): void {
    this.destroyed = true;
    this.onDestroy();
    for (const r of ROLES) {
      const p = this.players[r];
      if (p?.graceTimer) clearTimeout(p.graceTimer);
    }
  }

  // ---------------------------------------------------------------- output

  /** Send every seated player their own snapshot. */
  broadcast(): void {
    if (this.destroyed) return;
    for (const r of ROLES) {
      const p = this.players[r];
      if (p?.socketId) this.nsp.to(p.socketId).emit('room_updated', this.snapshotFor(r));
    }
  }

  /** Emit to everyone in the room channel. Subclasses wrap this with a typed helper. */
  protected emitRaw(event: string, ...args: unknown[]): void {
    this.nsp.to(this.code).emit(event, ...args);
  }
}
