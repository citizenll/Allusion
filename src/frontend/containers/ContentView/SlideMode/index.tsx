import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ZoomPan, { SlideTransform } from './ZoomPan';
import { useStore } from 'src/frontend/contexts/StoreContext';
import FileStore from 'src/frontend/stores/FileStore';
import UiStore from 'src/frontend/stores/UiStore';
import { IconSet, Split } from 'widgets';
import Inspector from '../../Inspector';
import { CommandDispatcher } from '../Commands';
import { ContentRect } from '../LayoutSwitcher';
import { createDimension, createTransform } from './utils';

const SlideMode = observer(({ contentRect }: { contentRect: ContentRect }) => {
  const { uiStore, fileStore } = useStore();
  const isInspectorOpen = uiStore.isInspectorOpen;
  const inspectorWidth = uiStore.inspectorWidth;
  const contentWidth = contentRect.width - (isInspectorOpen ? inspectorWidth : 0);
  const contentHeight = contentRect.height;

  return (
    <Split
      id="slide-mode"
      className={uiStore.isSlideMode ? 'fade-in' : 'fade-out'}
      primary={<Inspector />}
      secondary={
        <SlideView
          uiStore={uiStore}
          fileStore={fileStore}
          width={contentWidth}
          height={contentHeight}
        />
      }
      axis="vertical"
      align="right"
      splitPoint={inspectorWidth}
      isExpanded={isInspectorOpen}
      onMove={uiStore.moveInspectorSplitter}
    />
  );
});

interface SlideViewProps {
  width: number;
  height: number;
  uiStore: UiStore;
  fileStore: FileStore;
}

const SlideView = observer((props: SlideViewProps) => {
  const { uiStore, fileStore, width, height } = props;
  const file = fileStore.fileList[uiStore.firstItem];

  const eventManager = useMemo(() => new CommandDispatcher(file), [file]);

  // Go to the first selected image on load
  useEffect(() => {
    runInAction(() => {
      if (uiStore.firstSelectedFile !== undefined) {
        uiStore.setFirstItem(fileStore.getIndex(uiStore.firstSelectedFile.id));
      }
    });
  }, [fileStore, uiStore]);

  // Go back to previous view when pressing the back button (mouse button 5)
  useEffect(() => {
    // Push a dummy state, so that a pop-state event can be activated
    history.pushState(null, document.title, location.href);
    const popStateHandler = uiStore.disableSlideMode;
    window.addEventListener('popstate', popStateHandler);
    return () => window.removeEventListener('popstate', popStateHandler);
  }, [uiStore.disableSlideMode]);

  const decrImgIndex = useCallback(
    () => runInAction(() => uiStore.setFirstItem(Math.max(0, uiStore.firstItem - 1))),
    [uiStore],
  );
  const incrImgIndex = useCallback(
    () =>
      runInAction(() =>
        uiStore.setFirstItem(Math.min(uiStore.firstItem + 1, fileStore.fileList.length - 1)),
      ),
    [uiStore, fileStore.fileList.length],
  );

  // Detect left/right arrow keys to scroll between images. Top/down is already handled in the layout that's open in the background
  useEffect(() => {
    const handleUserKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        decrImgIndex();
        event.stopPropagation();
      } else if (event.key === 'ArrowRight') {
        incrImgIndex();
        event.stopPropagation();
      } else if (event.key === 'Escape' || event.key === 'Backspace') {
        uiStore.disableSlideMode();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleUserKeyPress);
    return () => {
      window.removeEventListener('keydown', handleUserKeyPress);
    };
  }, [decrImgIndex, incrImgIndex, uiStore]);

  // Preload next and previous image for better UX
  useEffect(() => {
    runInAction(() => {
      if (uiStore.firstItem + 1 < fileStore.fileList.length) {
        const nextImg = new Image();
        nextImg.src = fileStore.fileList[uiStore.firstItem + 1].absolutePath;
      }
      if (uiStore.firstItem - 1 >= 0) {
        const prevImg = new Image();
        prevImg.src = fileStore.fileList[uiStore.firstItem - 1].absolutePath;
      }
    });
  }, [fileStore.fileList, uiStore.firstItem]);

  const transitionStart: SlideTransform | undefined = useMemo(() => {
    const thumbEl = document.querySelector(`[data-file-id="${file.id}"]`);
    const container = document.querySelector('#gallery-content');
    if (thumbEl && container) {
      const thumbElRect = thumbEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return createTransform(
        thumbElRect.top - containerRect.top,
        thumbElRect.left - containerRect.left,
        thumbElRect.height / file.height,
      );
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  return (
    <ZoomableImage
      src={file.absolutePath}
      thumbnailSrc={file.thumbnailPath}
      width={width}
      height={height}
      imgWidth={file.width}
      imgHeight={file.height}
      transitionStart={transitionStart}
      transitionEnd={uiStore.isSlideMode ? undefined : transitionStart}
      prevImage={uiStore.firstItem - 1 >= 0 ? decrImgIndex : undefined}
      nextImage={uiStore.firstItem + 1 < fileStore.fileList.length ? incrImgIndex : undefined}
      eventManager={eventManager}
      onClose={uiStore.disableSlideMode}
    />
  );
});

interface ZoomableImageProps {
  src: string;
  thumbnailSrc?: string;
  width: number;
  height: number;
  imgWidth: number;
  imgHeight: number;
  prevImage?: () => void;
  nextImage?: () => void;
  transitionStart?: SlideTransform;
  transitionEnd?: SlideTransform;
  eventManager: CommandDispatcher;
  onClose: () => void;
}

const ZoomableImage = ({
  src,
  thumbnailSrc,
  width,
  height,
  imgWidth,
  imgHeight,
  prevImage,
  nextImage,
  transitionStart,
  transitionEnd,
  eventManager,
  onClose,
}: ZoomableImageProps) => {
  const [loadError, setLoadError] = useState<any>();
  useEffect(() => setLoadError(undefined), [src]);

  // in order to coordinate image dimensions at the time of loading, store current img src + dimensions together
  const [currentImg, setCurrentImg] = useState({
    src: thumbnailSrc || src,
    dimensions: createDimension(imgWidth, imgHeight),
  });
  useEffect(() => {
    setCurrentImg({
      src: thumbnailSrc || src,
      dimensions: createDimension(imgWidth, imgHeight),
    });
    const img = new Image();
    img.src = src;
    img.onload = () =>
      setCurrentImg((prevImg) =>
        prevImg.src === thumbnailSrc
          ? { src, dimensions: createDimension(imgWidth, imgHeight) }
          : prevImg,
      );
    img.onerror = setLoadError;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, thumbnailSrc]);

  const minScale = Math.min(0.1, Math.min(width / imgWidth, height / imgHeight));

  return (
    <div
      id="zoomable-image"
      style={{
        maxWidth: `${width}px`,
        height: `${height}px`,
      }}
      onContextMenu={eventManager.showSlideContextMenu}
      onDrop={eventManager.drop}
      tabIndex={-1}
    >
      {loadError ? (
        <div className="image-error" style={{ width: `${width}px`, height: `${height}px` }} />
      ) : (
        <ZoomPan
          position="center"
          initialScale="auto"
          doubleTapBehavior="zoomOrReset"
          imageDimension={currentImg.dimensions}
          containerDimension={createDimension(width, height)}
          minScale={minScale}
          maxScale={5}
          transitionStart={transitionStart}
          transitionEnd={transitionEnd}
          onClose={onClose}
          // debug
        >
          <img
            src={currentImg.src}
            width={currentImg.dimensions[0] || undefined}
            height={currentImg.dimensions[1] || undefined}
            alt={`Image could not be loaded: ${src}`}
            onError={setLoadError}
          />
        </ZoomPan>
      )}
      {/* Overlay buttons/icons */}
      {prevImage && (
        <button aria-label="previous image" className="side-button-left" onClick={prevImage}>
          {IconSet.ARROW_LEFT}
        </button>
      )}
      {nextImage && (
        <button aria-label="next image" className="side-button-right" onClick={nextImage}>
          {IconSet.ARROW_RIGHT}
        </button>
      )}
    </div>
  );
};

ZoomableImage.displayName = 'ZoomableImage';
SlideMode.displayName = 'SlideMode';

export default SlideMode;
