import './toolbar.scss';
import React, { useEffect, useRef, useState } from 'react';
import { Tooltip, Flyout } from '../Dialog/index';

interface IToolbar {
  children: React.ReactNode;
  id?: string;
  className?: string;
  label?: string;
  labelledby?: string;
  controls: string;
}

const Toolbar = (props: IToolbar) => {
  const { children, id, className, label, labelledby, controls } = props;

  return (
    <div
      role="toolbar"
      id={id}
      className={className}
      aria-label={label}
      aria-labelledby={labelledby}
      aria-controls={controls}
    >
      {children}
    </div>
  );
};

interface IBaseButton {
  id?: string;
  text: React.ReactText;
  icon: JSX.Element;
  onClick?: (event: React.MouseEvent) => void;
  showLabel?: 'always' | 'never';
  tooltip?: string;
  tabIndex?: 0 | -1;
}

interface IToolbarButton extends IBaseButton {
  role?: string;
  disabled?: boolean;
  pressed?: boolean;
  checked?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
}

const ToolbarButton = (props: IToolbarButton) => {
  const {
    id,
    onClick,
    icon,
    text,
    role,
    pressed,
    checked,
    disabled,
    tooltip,
    showLabel,
    expanded,
    controls,
    haspopup,
    tabIndex,
  } = props;
  const content = (
    <span className="toolbar-button-content">
      <span className="toolbar-button-icon" aria-hidden>
        {icon}
      </span>
      <span className={`toolbar-button-text ${showLabel ?? ''}`}>{text}</span>
    </span>
  );
  return (
    <button
      id={id}
      className="toolbar-item toolbar-button"
      onClick={disabled ? undefined : onClick}
      role={role}
      aria-pressed={pressed}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-controls={controls}
      aria-haspopup={haspopup}
      aria-expanded={expanded}
      tabIndex={tabIndex ?? -1}
    >
      {tooltip ? (
        <Tooltip content={tooltip} hoverDelay={1500}>
          {content}
        </Tooltip>
      ) : (
        content
      )}
    </button>
  );
};

interface IBaseGroup {
  children: React.ReactNode;
  showLabel?: 'always' | 'never';
}

interface IToolbarGroup extends IBaseGroup {
  id?: string;
  label?: string;
  role?: string;
}

const ToolbarGroup = (props: IToolbarGroup) => {
  const { id, label, children, role, showLabel } = props;
  return (
    <div id={id} className={`toolbar-group ${showLabel ?? ''}`} role={role} aria-label={label}>
      {children}
    </div>
  );
};

interface IToolbarToggleButton extends IBaseButton {
  controls?: string;
  pressed: boolean;
}

const ToolbarToggleButton = (props: IToolbarToggleButton) => {
  const { id, pressed, onClick, icon, text, tooltip, showLabel, controls, tabIndex } = props;
  return (
    <ToolbarButton
      id={id}
      pressed={pressed}
      onClick={onClick}
      icon={icon}
      text={text}
      showLabel={showLabel}
      tooltip={tooltip}
      controls={controls}
      tabIndex={tabIndex}
    />
  );
};

interface IToolbarSegment extends IBaseGroup {
  label: string;
}

const ToolbarSegment = ({ label, children, showLabel }: IToolbarSegment) => {
  return (
    <ToolbarGroup role="radiogroup" label={label} showLabel={showLabel}>
      {children}
    </ToolbarGroup>
  );
};

interface IToolbarSegmentButton extends IBaseButton {
  checked: boolean;
}

const ToolbarSegmentButton = (props: IToolbarSegmentButton) => {
  const { id, checked, onClick, icon, text, tooltip, showLabel, tabIndex } = props;
  return (
    <ToolbarButton
      id={id}
      role="radio"
      checked={checked}
      onClick={onClick}
      icon={icon}
      text={text}
      tooltip={tooltip}
      showLabel={showLabel}
      tabIndex={tabIndex}
    />
  );
};

const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'Enter': {
      const item = e.currentTarget.querySelector('dialog [tabindex="0"]:focus') as HTMLElement;
      if (item) {
        e.stopPropagation();
        item.click();
        e.currentTarget.querySelector('button')?.focus();
      }
      break;
    }

    case 'Escape':
      const item = e.currentTarget.querySelector('dialog [tabindex="0"]:focus') as HTMLElement;
      if (item) {
        e.stopPropagation();
        item.blur();
        e.currentTarget.querySelector('button')?.focus();
      }
      break;

    default:
      break;
  }
};

const handleFlyoutBlur = (e: React.FocusEvent) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
    const dialog = e.currentTarget.lastElementChild as HTMLDialogElement;
    if (dialog.open) {
      dialog.close();
    }
  }
};

interface IToolbarMenuButton extends IBaseButton {
  controls: string;
  /** The element must be a Menu component otherwise focus will not work. */
  children: React.ReactNode;
  disabled?: boolean;
  /** @default 'menu' */
  role?: 'menu' | 'group';
}

const ToolbarMenuButton = (props: IToolbarMenuButton) => {
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current && isOpen) {
      // Focus first focusable menu item
      const first = container.current.querySelector('[role^="menuitem"]') as HTMLElement;
      // The Menu component will handle setting the tab indices.
      first?.focus();
    }
  }, [isOpen]);

  return (
    <div ref={container} onKeyDown={handleKeyDown} onBlur={handleFlyoutBlur}>
      <Flyout
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
        target={
          <ToolbarButton
            id={props.id}
            icon={props.icon}
            text={props.text}
            disabled={props.disabled}
            showLabel={props.showLabel}
            tooltip={props.tooltip}
            onClick={() => setIsOpen(!isOpen)}
            expanded={isOpen}
            controls={props.controls}
            tabIndex={props.tabIndex}
            haspopup="menu"
          />
        }
      >
        {props.children}
      </Flyout>
    </div>
  );
};

export {
  Toolbar,
  ToolbarGroup,
  ToolbarButton,
  ToolbarMenuButton,
  ToolbarSegment,
  ToolbarSegmentButton,
  ToolbarToggleButton,
};
