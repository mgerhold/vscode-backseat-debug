import { EventEmitter } from 'events';
import { Socket, createConnection } from 'net';

const DEBUGGER_PORT = 57017;

export interface Breakpoints {
    locations: number[];
}

export type Request = StartExecution | Continue | StepOne |
    SetBreakpoints | RemoveBreakpoints | ListBreakpoints;
export type Address = number;

export class StartExecution { }

export class SetBreakpoints {
    // @ts-ignore Suppressing invalid "declared but never used". All fields are used by JSON.stringify.
    constructor(private readonly locations: Address[]) { }
}

export class RemoveBreakpoints {
    // @ts-ignore Suppressing invalid "declared but never used". All fields are used by JSON.stringify.
    constructor(private readonly locations: Address[]) { }
}

export class Continue { }
export class StepOne { }

export type Response = ListBreakpoints | HitBreakpoint | Breaking;

export class ListBreakpoints { }

export class HitBreakpoint {
    constructor(public readonly location: Address) { }
}

export class Breaking {
    constructor(public readonly location: Address) { }
}

export class DebugConnection extends EventEmitter {
    private receiveBuffer = '';
    private client?: Socket;

    public static connect(): Promise<DebugConnection> {
        return new Promise((resolve, reject) => {
            let connected = false;
            const debugConnection = new DebugConnection();
            const client = createConnection({ port: DEBUGGER_PORT }, () => {
                connected = true;
                resolve(debugConnection);
            });

            debugConnection.client = client;

            client.on('error', error => {
                if (!connected) { reject(error); }
                debugConnection.clientError(error);
            });

            client.on('data', data => debugConnection.clientData(data));
        });
    }

    public send(request: Request) {
        const name = request.constructor.name;
        const stringifiedRequest = JSON.stringify({ [name]: request });
        this.client?.write(`${stringifiedRequest}\0`, 'utf8');
    }

    private clientError(error: Error) {
        this.sendEvent('error', error);
    }

    private clientData(data: Buffer) {
        let index = data.indexOf(0);
        if (index < 0) {
            this.receiveBuffer += data.toString('utf8');
            return;
        }

        if (index > 0) {
            this.receiveBuffer += data.toString('utf8', 0, index);
        }
        this.receivedMessage(this.receiveBuffer);
        this.receiveBuffer = '';

        while (true) {
            const start = index + 1;
            index = data.indexOf(0, start);

            if (index < 0) {
                this.receiveBuffer = data.toString('utf8', start);
                break;
            }

            const chunk = data.toString('utf8', start, index);
            this.receivedMessage(chunk);
        }
    }

    private receivedMessage(message: string) {
        const json = JSON.parse(message);
        const events = [
            'HitBreakpoint',
            'Breakpoints',
            'Breaking'
        ];
        for (const event of events) {
            if (json.hasOwnProperty(event)) {
                this.sendEvent(`message-${event.toLowerCase()}`, json[event]);
            }
        }
    }

    private sendEvent(event: string, ...args: any[]): void {
        setTimeout(() => {
            this.emit(event, ...args);
        }, 0);
    }
}
