
/* Can I get a Hello World from SAD?
Following the same style as lean-client-js, apologies to Gabriel Ebner & co. */

export interface Disposable {dispose();}

/** Simple manager of handlers. */
export class Event<E> {
    handlers : Array<(e:E) => void> = [];
    on(handler : (e:E) => void) : Disposable {
        this.handlers.push(handler);
        return {dispose : () => {this.handlers = this.handlers.filter(h => (h !== handler));}}
    }
    fire(e:E) {for (let h of this.handlers) h(e);}
    dispose(){this.handlers = [];}
}
export interface StderrError { error: 'stderr'; chunk: string;}
export interface ConnectError { error: 'connect'; message: string; reason?: string;}
export interface UnrelatedError { error: 'unrelated'; message: string;}
export type TransportError = StderrError | ConnectError;
export type ServerError = TransportError | UnrelatedError;
export interface Connection {
    error : Event<TransportError>;
    jsonMessage : Event<any>;
    alive : boolean;
    send(jsonMsg : any);
    dispose();
}

export interface Transport {
    connect() : Connection;
}
export interface Request {
    command: string;
    seq_num?: number; // the sequence number is filled in automatically
}

export type Severity = 'information' | 'warning' | 'error';

export interface Message {
    file_name: string;
    pos_line: number;
    pos_col: number;
    end_pos_line?: number;
    end_pos_col?: number;
    severity: Severity;
    caption: string;
    text: string;
}
export interface ErrorResponse {
    response: 'error';
    seq_num?: number;
    message: string;
}
export interface AllMessagesResponse { response: 'all_messages'; msgs: Message[]; }
export interface Task {
    file_name: string;
    pos_line: number;
    pos_col: number;
    end_pos_line: number;
    end_pos_col: number;
    desc: string;
}
export interface CurrentTasksResponse {
    response: 'current_tasks';
    is_running: boolean;
    cur_task?: Task;
    tasks: Task[];
}
export interface CommandResponse { response: 'ok'; seq_num: number; }
export type Response = AllMessagesResponse | CommandResponse | ErrorResponse | CurrentTasksResponse
interface SentRequestInfo {
    resolve: (res: CommandResponse) => void;
    reject: (err: any) => void;
}
type SentRequestsMap = Map<number, SentRequestInfo>;

export class Server {
    error : Event<ServerError> = new Event();
    allMessages: Event<AllMessagesResponse> = new Event();
    tasks : Event<CurrentTasksResponse> = new Event();
    logMessagesToConsole = false;
    private currentSeqNum: number = 0;
    private conn?: Connection;
    private currentMessages: Message[] = [];
    private sentRequests: SentRequestsMap = new Map();

    constructor(public transport : Transport) {}
    connect() {
        this.conn = this.transport.connect();
        this.conn.jsonMessage.on((msg) => this.onMessage(msg));
        this.conn.error.on((msg) => this.error.fire(msg));
    }
    restart() {this.dispose(); this.connect();}
    dispose() {
        if (this.conn) {
            this.conn.dispose();
            this.sentRequests.forEach((info, seqNum) => info.reject('disposed'));
            this.sentRequests.clear();
            this.currentSeqNum = 0;
            this.conn = null;
        }
    }
    alive(): boolean {return this.conn && this.conn.alive;}
    send(req:Request) : Promise<CommandResponse> {
        if (!this.alive()) {
            return new Promise((resolve, reject) => reject('server is not alive'));
        }

        if (this.logMessagesToConsole) {
            console.log('==> server: ', req);
        }

        req.seq_num = this.currentSeqNum++;
        const promise = new Promise<CommandResponse>((resolve, reject) =>
            this.sentRequests.set(req.seq_num, { resolve, reject }));
        this.conn.send(req);
        return promise;
    }
    private onMessage(msg:Response) {
        if (this.logMessagesToConsole) {
            console.log('<== server: ', msg);
        }

        if (msg.response === 'ok' || msg.response === 'error') {
            const reqInfo = this.sentRequests.get(msg.seq_num);
            this.sentRequests.delete(msg.seq_num);
            if (msg.response === 'ok') {
                reqInfo.resolve(msg);
            } else {
                reqInfo.reject(msg.message || msg);
            }
        } else if (msg.response === 'all_messages') {
            this.currentMessages = msg.msgs;
            this.allMessages.fire(msg);
        } else if (msg.response === 'current_tasks') {
            this.tasks.fire(msg);
        } else {
            // unrelated error
            //@ts-ignore
            this.error.fire({error: 'unrelated', message: msg.message || JSON.stringify(msg)});
        }
    }
}