<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLOptionAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOptionAttributes> = $props();
</script>

<option
	{@attach (element) => {
		ref = element;
		return () => {
			ref = null;
		};
	}}
	data-slot="native-select-option"
	class={cn('bg-[Canvas] text-[CanvasText]', className)}
	{...restProps}
>
	{@render children?.()}
</option>
