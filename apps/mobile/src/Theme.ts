import { StyleSheet } from 'react-native';

export const colors = {
  background: '#10101a',
  panel: '#19192a',
  surface: '#202035',
  line: '#292941',
  ink: '#f5f3ff',
  muted: '#a5a1b9',
  lime: '#bdf66c',
  violet: '#ab9cff',
  violetSoft: '#282348',
  heroPanel: '#1d1930',
  heroLine: '#41365a',
  heroTile: '#29362d',
  heroTileLine: '#536b43',
  limeInset: '#a8dc61',
  limeDetail: '#334124',
  amber: '#edbd66',
  danger: '#ff9b9d',
  correct: '#2a5a3c',
  present: '#695026',
  absent: '#33334a',
} as const;

export const baseStyles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.3,
  },
  subtitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  section: { gap: 14 },
  sectionTitle: { gap: 5, marginBottom: 2 },
});
