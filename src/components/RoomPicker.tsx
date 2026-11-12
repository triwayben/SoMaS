import { DeviceArt } from "./DeviceArt";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { isPlaying } from "../lib/players";
import { useApp } from "../store";

export function RoomPicker({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const players = Object.values(app.players).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sheet open onClose={onClose} title="Play on" subtitle="Choose the room you want to control">
      <div className="rows">
        {players.map((player) => (
          <button
            key={player.player_id}
            className={`row row--select ${player.player_id === app.selectedId ? "is-selected" : ""}`}
            onClick={() => {
              app.selectPlayer(player.player_id);
              onClose();
            }}
          >
            <span className="row__art">
              <DeviceArt player={player} size={52} baseUrl={app.baseUrl} />
            </span>
            <span className="row__body">
              <span className="row__title">{player.name}</span>
              <span className="row__sub">
                {isPlaying(player)
                  ? "Playing"
                  : player.available === false
                    ? "Offline"
                    : player.device_info?.model ?? "Speaker"}
              </span>
            </span>
            {player.player_id === app.selectedId ? (
              <span className="row__check">
                <Icon name="check" size={18} strokeWidth={2.2} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
