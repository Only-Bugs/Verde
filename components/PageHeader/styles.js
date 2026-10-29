import { StyleSheet } from "react-native";
import colors from "../../theme/colors";
import layout from "../../theme/layout";

export default StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: layout.cardSpacing / 2,
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  titleWithBack: {
    marginLeft: layout.cardSpacing / 2,
  },
  actions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    padding: 8,
    marginLeft: layout.cardSpacing / 2,
  },
  backButton: {
    marginLeft: 0,
    marginRight: layout.cardSpacing / 2,
  },
});
