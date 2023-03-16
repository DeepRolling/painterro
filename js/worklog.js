import {tr} from "./translation";

export default class WorkLog {
    constructor(main, changedHandler, undoCapture, redoCapture) {
        this.main = main;
        this.current = null;
        this.changedHandler = changedHandler;
        this.undoCapture = undoCapture;
        this.redoCapture = redoCapture;
        this.empty = true;
        this.clean = true;
        this.ctx = main.ctx;
    }

    getWorklogAsString(params) {
        const saveState = Object.assign({}, this.current);
        let curCleared = this.clearedCount;

        if (params && params.limit !== undefined) {
            const limit = params.limit;
            curCleared = 0;
            let active = saveState;
            let i;
            for (i = 0; i < limit; i += 1) {
                active.prevCount = limit - i;
                if (i < limit - 1 && active.prev) {
                    active = active.prev;
                }
            }
            active.prev = null;
        }
        // return JSON.stringify({
        //     clearedCount: curCleared,
        //     current: saveState,
        // });
        return {
            clearedCount: curCleared,
            current: saveState,
        };
    }

    loadWorklogFromString(str) {
        // const obj = JSON.parse(str);
        const obj = str;
        if (obj) {
            this.clearedCount = obj.clearedCount;
            this.current = obj.current;
            this.applyState(this.current);
        }
        return this.main;
    }

    /**
     * invoke changedHandler passed in this class
     * @param initial
     * @param type 'new'/'redo'/'undo'
     * @param ignoreChangedHandler pass true to ignore callback invoke
     */
    changed(initial, type, ignoreChangedHandler) {
        if (this.current.prevCount - this.clearedCount > this.main.params.worklogLimit) {
            this.first = this.first.next;
            this.first.prev = null;
            this.clearedCount += 1;
        }
        if (ignoreChangedHandler !== true) {
            this.changedHandler({
                first: this.current.prev === null,
                last: this.current.next === null,
                type,
                current: this.current,
                initial,
            });
        }
        this.empty = initial;
        this.clean = false;
    }


    /**
     * call when editor need store current status
     * @param initial
     * @param extraInfo extra information store in current state, will pass to callback function such : this.changedHandler/this.main.params.onUndo/this.main.params.onRedo if exist
     */
    captureState(initial, extraInfo) {

        const operationToolName = this.main.activeTool ? this.main.activeTool.name : null;
        let activeToolName = this.main.activeTool ? this.main.activeTool.name : null;
        if (this.main.params.NON_SELECTABLE_TOOLS.includes(activeToolName)) {
            activeToolName = this.main.defaultTool.name;
        }

        const state = {
            sizew: this.main.size.w,
            sizeh: this.main.size.h,
            extraInfo,
            activeToolName,
            operationToolName,
            data: this.ctx.getImageData(0, 0, this.main.size.w, this.main.size.h),
        };
        if (this.current === null) {
            state.prev = null;
            state.prevCount = 0;
            this.first = state;
            this.clearedCount = 0;
        } else {
            state.prev = this.current;
            state.prevCount = this.current.prevCount + 1;
            this.current.next = state;
        }
        state.next = null;
        this.current = state;
        console.log('captureState called, this.current updated : ',this.current)
        this.changed(initial, 'new');
    }

    reCaptureState() {
        if (this.current.prev !== null) {
            this.current = this.current.prev;
        }
        this.captureState();
    }

    applyState(state) {
        this.main.resize(state.sizew, state.sizeh);
        this.main.ctx.putImageData(state.data, 0, 0);
        this.main.adjustSizeFull();
        this.main.select.hide();
    }


    /**
     * undo current state, notice, state can be resumed by {@link redoState} after call this function
     * @param dropCurrentState just drop current state, i.e. current state can't be resumed by {@link redoState}
     */
    undoState(dropCurrentState) {
        if (this.current.prev !== null) {
            this.undoCapture(this.current)
            let currentToolName = this.current.activeToolName;
            this.current = this.current.prev;
            if (dropCurrentState === true) {
                this.current.next = null;
            }
            this.applyState(this.current);
            this.changed(false, 'undo', dropCurrentState);
            if (currentToolName) {
                this.main.closeActiveTool(true);
                this.main.setActiveTool(this.main.toolByName[currentToolName])
            } else {
                this.main.closeActiveTool();
            }

            if (this.main.params.onUndo) {
                this.main.params.onUndo(this.current);
            }
        }else {
            if (this.main.params.onNotUndoOperation) {
                this.main.params.onNotUndoOperation();
            }
        }
    }

    dropState() {
        this.undoState(true)
    }

    redoState() {
        if (this.current.next !== null) {
            this.redoCapture(this.current)
            this.current = this.current.next;
            this.applyState(this.current);
            this.changed(false, 'redo');

            const nextToolName = this.current.activeToolName;

            if (nextToolName) {
                this.main.closeActiveTool(true);
                this.main.setActiveTool(this.main.toolByName[nextToolName])
            } else {
                this.main.closeActiveTool();
            }

            if (this.main.params.onRedo) {
                this.main.params.onRedo(this.current);
            }
        }else {
            if (this.main.params.onNotRedoOperation) {
                this.main.params.onNotRedoOperation();
            }
        }
    }
}
