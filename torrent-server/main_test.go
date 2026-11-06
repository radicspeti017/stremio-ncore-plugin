package main

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	bittorrent "github.com/anacrolix/torrent"
)

type blockingTorrentReader struct {
	bittorrent.Reader
	started chan struct{}
}

func (reader blockingTorrentReader) ReadContext(ctx context.Context, buffer []byte) (int, error) {
	close(reader.started)
	<-ctx.Done()
	return 0, ctx.Err()
}

func TestTorrentReaderCancelsPendingRead(t *testing.T) {
	requestContext, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := make(chan struct{})
	reader := io.LimitReader(torrentReader{
		context: requestContext,
		reader:  blockingTorrentReader{started: started},
	}, 1024)
	result := make(chan error, 1)
	go func() {
		_, err := io.Copy(io.Discard, reader)
		result <- err
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("torrent read did not start")
	}
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context cancellation, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("torrent read did not stop after request cancellation")
	}
}
