import { StyleSheet } from 'react-native';

export const colors = {
  background: '#061321',
  panel: '#102438',
  surface: '#17344b',
  line: '#3b5666',
  ink: '#fff2d9',
  muted: '#bfd0d7',
  gold: '#f4ca71',
  tealLight: '#8cddd7',
  tealSoft: '#113f47',
  heroPanel: '#111f37',
  heroLine: '#977340',
  heroTile: '#123d48',
  heroTileLine: '#326965',
  goldInset: '#d5a749',
  goldInk: '#3b290e',
  amber: '#f3c275',
  danger: '#ffc0bc',
  positive: '#95e2ba',
  correct: '#225a43',
  present: '#715021',
  absent: '#30435a',
} as const;

export const baseStyles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontFamily: 'serif',
    fontSize: 35,
    lineHeight: 43,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  section: { gap: 14 },
  sectionTitle: { gap: 5, marginBottom: 2 },
});
