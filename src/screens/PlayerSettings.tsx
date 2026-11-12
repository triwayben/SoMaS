import { TopBar } from "../components/TopBar";
import { useNav } from "../nav";
import { useApp } from "../store";
import { PlayerSettingsContent } from "./PlayerSettingsContent";

export function PlayerSettingsScreen({ playerId }: { playerId: string }) {
  const app = useApp();
  const nav = useNav();
  const player = app.players[playerId];

  return (
    <>
      <TopBar title={player?.name ?? "Room"} subtitle={player?.device_info?.model} onBack={nav.back} />
      <PlayerSettingsContent playerId={playerId} />
    </>
  );
}
