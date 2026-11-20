import { DndContext, KeyboardSensor } from "@dnd-kit/core"
import type { DndContextProps, KeyboardSensorOptions, KeyboardSensorProps } from "@dnd-kit/core"
import { useEffect, useMemo, useState } from "react"

/*
 * Written against @dnd-kit/core 6.3.1, and reaches into KeyboardSensor's
 * private detach(). The sensor removes its document and window listeners only
 * when its own drop or cancel runs, and DndContext neither cancels an active
 * drag on unmount nor exposes a way to, so a row still lifted when its
 * DndContext unmounts leaves a keydown listener preventing the default on the
 * arrows and the first Space, Enter, Tab or Escape page-wide.
 * unmountSafeKeyboardSensor.test.tsx fails if those private members change.
 */

interface KeyboardSensorPrivates {
  detach(): void
}

interface UnmountSafeKeyboardSensorOptions extends KeyboardSensorOptions {
  liveSensors?: Set<UnmountSafeKeyboardSensor>
}

/**
 * dnd-kit's KeyboardSensor, releasable by the UnmountSafeDndContext it was
 * picked up in. Used anywhere else it is a plain KeyboardSensor.
 */
export class UnmountSafeKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props)
    const liveSensors = (props.options as UnmountSafeKeyboardSensorOptions).liveSensors
    if (!liveSensors) return

    const privates = this as unknown as KeyboardSensorPrivates
    const detach = privates.detach.bind(this)
    privates.detach = () => {
      detach()
      liveSensors.delete(this)
    }
    liveSensors.add(this)
  }

  release() {
    const { detach } = this as unknown as KeyboardSensorPrivates
    detach.call(this)
    // The pickup adds its keydown listener in a setTimeout, so a release
    // inside that tick has to run again once it has been added.
    setTimeout(() => detach.call(this))
  }
}

/**
 * DndContext that releases a row still lifted by an UnmountSafeKeyboardSensor
 * when it unmounts. Use it with that sensor in place of DndContext and
 * KeyboardSensor.
 */
export function UnmountSafeDndContext({ sensors, ...props }: DndContextProps) {
  const [liveSensors] = useState(() => new Set<UnmountSafeKeyboardSensor>())

  const wiredSensors = useMemo(
    () =>
      sensors?.map((descriptor) =>
        descriptor.sensor === UnmountSafeKeyboardSensor
          ? { ...descriptor, options: { ...descriptor.options, liveSensors } }
          : descriptor
      ),
    [sensors, liveSensors]
  )

  useEffect(
    () => () => {
      for (const sensor of [...liveSensors]) sensor.release()
    },
    [liveSensors]
  )

  return <DndContext sensors={wiredSensors} {...props} />
}
