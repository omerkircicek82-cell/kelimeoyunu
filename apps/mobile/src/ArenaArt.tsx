import { Image, StyleSheet, View } from 'react-native';

export const arenaCrest = require('../assets/harfarena-crest.webp');
const arenaHall = require('../assets/harfarena-hall.webp');

export function ArenaBackdrop({ muted = false }: { muted?: boolean }) {
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Image source={arenaHall} resizeMode="cover" style={styles.image} />
      <View style={[StyleSheet.absoluteFill, muted ? styles.muted : styles.tint]} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  tint: { backgroundColor: 'rgba(4, 15, 26, 0.28)' },
  muted: { backgroundColor: 'rgba(4, 15, 26, 0.89)' },
});
