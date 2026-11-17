// A licensed background photo under the brand forest-green overlay.
//
// Renders the photo with next/image (responsive sizes, WebP). With `srcMobile`
// set it art-directs via <picture>, so phones and larger screens each
// download only their own crop. The overlay keeps the photo on-brand and
// gives the product demo or copy on top its contrast.
//
// Layers, bottom to top: photo → forest overlay. The photo is decorative.

import React from 'react'
import Image, { getImageProps } from 'next/image'
import styles from './marketing.module.css'
import type { MarketingPhoto } from './content'

export function PhotoSlot({
  photo,
  className,
  sizes,
  priority = false,
}: {
  photo: MarketingPhoto
  className?: string
  /** next/image `sizes` for the rendered width of this slot. */
  sizes: string
  priority?: boolean
}) {
  return (
    <div
      className={[styles.photo, className].filter(Boolean).join(' ')}
      data-photo-slot={photo.id}
      aria-hidden="true"
    >
      {photo.srcMobile ? (
        <ArtDirected photo={photo} sizes={sizes} priority={priority} />
      ) : (
        <Image
          src={photo.src}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className={styles.photoImg}
          style={focusVars(photo)}
        />
      )}
      <div
        className={[styles.photoOverlay, photo.overlay === 'text' ? styles.photoOverlayText : ''].join(' ')}
        data-overlay="forest"
        data-overlay-strength={photo.overlay ?? 'brand'}
        style={overlayVars(photo)}
      />
    </div>
  )
}

function focusVars(photo: MarketingPhoto) {
  return {
    ['--focus' as string]: photo.focus ?? 'center',
    ['--focus-mobile' as string]: photo.focusMobile ?? photo.focus ?? 'center',
  } as React.CSSProperties
}

/** Per-photo 'brand' overlay tuning (see MarketingPhoto.overlayOpacity). */
function overlayVars(photo: MarketingPhoto): React.CSSProperties | undefined {
  if (!photo.overlayOpacity || photo.overlay === 'text') return undefined
  const [a, b, c] = photo.overlayOpacity
  return {
    ['--overlay-a' as string]: a,
    ['--overlay-b' as string]: b,
    ['--overlay-c' as string]: c,
  } as React.CSSProperties
}

/** <picture> with a phone crop below 640px and the main crop above. */
function ArtDirected({ photo, sizes, priority }: { photo: MarketingPhoto; sizes: string; priority: boolean }) {
  const common = { alt: '', fill: true, sizes, priority }
  const { props: { srcSet: wideSrcSet } } = getImageProps({ ...common, src: photo.src })
  const { props: { style, ...mobileProps } } = getImageProps({ ...common, src: photo.srcMobile! })
  return (
    <picture>
      <source media="(min-width: 640px)" srcSet={wideSrcSet} sizes={sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt="" comes from getImageProps (decorative) */}
      <img {...mobileProps} className={styles.photoImg} style={{ ...style, ...focusVars(photo) }} />
    </picture>
  )
}
