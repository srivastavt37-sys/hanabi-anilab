import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import DatasetIcon from '@mui/icons-material/Dataset';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';

export function SyncBadge() {
  const { user } = useAuth();
  const { syncing, lastSyncedAt } = useAppData();
  if (!user) {
    return (
      <Tooltip title="Sign in from Account to sync your library and progress across devices.">
        <Chip
          size="small"
          icon={<CloudOffIcon />}
          label="Local only"
          sx={{ bgcolor: 'action.hover', display: { xs: 'none', sm: 'inline-flex' } }}
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={
        syncing
          ? 'Syncing your library…'
          : lastSyncedAt
            ? `Synced at ${new Date(lastSyncedAt).toLocaleTimeString()}`
            : 'Signed in — your library syncs to your account'
      }
    >
      <Chip
        size="small"
        icon={syncing ? <SyncIcon /> : <CloudDoneIcon />}
        label={syncing ? 'Syncing' : 'Synced'}
        sx={{ bgcolor: 'action.hover', display: { xs: 'none', sm: 'inline-flex' } }}
      />
    </Tooltip>
  );
}

export function CatalogueSourceBadge({ source }: { source: 'anilist' | 'demo' | 'loading' | 'error' }) {
  if (source === 'anilist' || source === 'loading') return null;
  return (
    <Tooltip title="AniList is unreachable right now — showing the bundled demo catalogue. Your library and progress still work.">
      <Chip size="small" icon={<DatasetIcon />} label="Offline mode" sx={{ bgcolor: 'action.hover' }} />
    </Tooltip>
  );
}
