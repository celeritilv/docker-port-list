import React from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { createDockerDesktopClient } from '@docker/extension-api-client';

// Note: This line relies on Docker Desktop's presence as a host application.
// If you're running this React app in a browser, it won't work properly.
const ddClient = createDockerDesktopClient();

interface ContainerPort {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

interface ContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports: ContainerPort[];
  Labels?: { [key: string]: string };
}

interface PortRow {
  hostPort: number;
  protocol: string;
  hostIp: string;
  ipFamily: 'ipv4' | 'ipv6';
  containerPort: number;
  containerName: string;
  project: string;
  image: string;
  containerId: string;
  state: string;
  status: string;
}

function containerDisplayName(names: string[]): string {
  if (!names || names.length === 0) return '(unknown)';
  return names[0].replace(/^\//, '');
}

function classifyIp(ip: string): 'ipv4' | 'ipv6' {
  return ip.includes(':') ? 'ipv6' : 'ipv4';
}

function buildPortRows(containers: ContainerInfo[]): PortRow[] {
  const rows: PortRow[] = [];
  for (const container of containers) {
    for (const port of container.Ports ?? []) {
      if (!port.PublicPort) continue; // only host-published ports occupy a host port
      const hostIp = port.IP && port.IP !== '' ? port.IP : '0.0.0.0';
      rows.push({
        hostPort: port.PublicPort,
        protocol: port.Type,
        hostIp,
        ipFamily: classifyIp(hostIp),
        containerPort: port.PrivatePort,
        containerName: containerDisplayName(container.Names),
        project: container.Labels?.['com.docker.compose.project'] ?? '-',
        image: container.Image,
        containerId: container.Id.substring(0, 12),
        state: container.State,
        status: container.Status,
      });
    }
  }
  // Running containers first (an actually-bound port matters more than a
  // reserved-but-stopped one), then by host port/protocol for readability.
  rows.sort(
    (a, b) =>
      Number(b.state === 'running') - Number(a.state === 'running') ||
      a.hostPort - b.hostPort ||
      a.protocol.localeCompare(b.protocol),
  );
  return rows;
}

export function App() {
  const [rows, setRows] = React.useState<PortRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>();
  const [filter, setFilter] = React.useState<string>('');
  const [autoRefresh, setAutoRefresh] = React.useState<boolean>(true);
  const [showStopped, setShowStopped] = React.useState<boolean>(true);
  const [ipFamilyFilter, setIpFamilyFilter] = React.useState<'all' | 'ipv4' | 'ipv6'>('all');

  const load = React.useCallback(async () => {
    try {
      // {all: true} includes stopped containers, so ports reserved by a
      // turned-off container/compose project still show up (marked "exited").
      const result = (await ddClient.docker.listContainers({ all: true })) as ContainerInfo[];
      setRows(buildPortRows(result));
      setError(undefined);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const filtered = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows
      .filter((r) => showStopped || r.state === 'running')
      .filter((r) => ipFamilyFilter === 'all' || r.ipFamily === ipFamilyFilter)
      .filter((r) => {
        if (!needle) return true;
        return [
          r.hostPort,
          r.containerPort,
          r.protocol,
          r.containerName,
          r.project,
          r.image,
          r.containerId,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      });
  }, [rows, filter, showStopped, ipFamilyFilter]);

  return (
    <>
      <Typography variant="h3">Port Lister</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
        Host ports published by containers in this Docker Desktop and which container (and
        compose project) is using each one — including ports reserved by stopped containers, so
        you can spot conflicts before starting them back up.
      </Typography>

      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={2} sx={{ mt: 3 }}>
        <TextField
          label="Filter"
          placeholder="port, container, project, image..."
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <ToggleButtonGroup
          size="small"
          value={ipFamilyFilter}
          exclusive
          onChange={(_e, value) => value && setIpFamilyFilter(value)}
        >
          <ToggleButton value="all">ALL</ToggleButton>
          <ToggleButton value="ipv4">IPv4</ToggleButton>
          <ToggleButton value="ipv6">IPv6</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Refresh now">
          <IconButton onClick={load} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <FormControlLabel
          control={
            <Switch checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          }
          label="Auto-refresh (5s)"
        />
        <FormControlLabel
          control={
            <Switch checked={showStopped} onChange={(e) => setShowStopped(e.target.checked)} />
          }
          label="Show stopped"
        />
        <Box sx={{ flexGrow: 1 }} />
        <Chip label={`${filtered.length} port${filtered.length === 1 ? '' : 's'}`} />
        {loading && <CircularProgress size={20} />}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load containers: {error}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ mt: 3 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Host port</TableCell>
              <TableCell>Protocol</TableCell>
              <TableCell>Host IP</TableCell>
              <TableCell>Container port</TableCell>
              <TableCell>Used by</TableCell>
              <TableCell>Project</TableCell>
              <TableCell>Image</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row, idx) => (
              <TableRow key={`${row.hostPort}-${row.protocol}-${row.hostIp}-${idx}`} hover>
                <TableCell>
                  <Typography fontWeight={600}>{row.hostPort}</Typography>
                </TableCell>
                <TableCell>{row.protocol.toUpperCase()}</TableCell>
                <TableCell>{row.hostIp}</TableCell>
                <TableCell>{row.containerPort}</TableCell>
                <TableCell>
                  {row.containerName}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {row.containerId}
                  </Typography>
                </TableCell>
                <TableCell>{row.project}</TableCell>
                <TableCell>{row.image}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={row.state}
                    color={row.state === 'running' ? 'success' : 'default'}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ py: 2 }} align="center">
                    No published ports found.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
