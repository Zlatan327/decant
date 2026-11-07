interface WorkspaceHeaderProps {
  title: string;
  description: string;
  context: string;
}

export function WorkspaceHeader({ title, description, context }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__title">
        <h1>{title}</h1>
        <span className="workspace-header__context">{context}</span>
      </div>
      <p className="workspace-header__desc">{description}</p>
    </header>
  );
}
