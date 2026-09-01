export const antPickerPopupProps = {
  placement: "bottomLeft" as const,
  getPopupContainer: (trigger: HTMLElement) =>
    (trigger.closest(".react-aria-Modal") as HTMLElement) ?? trigger.parentElement!,
  styles: {
    popup: {
      root: {zIndex: 1100},
    },
  },
};
