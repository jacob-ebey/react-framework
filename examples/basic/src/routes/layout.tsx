export default function LayoutRoute({
	children,
}: { children?: React.ReactNode }) {
	return (
		<div>
			<h1>Layout</h1>
			{children}
		</div>
	);
}
