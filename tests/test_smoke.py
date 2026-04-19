from sayclearly.main import main


def test_main_prints_placeholder_message(capsys) -> None:
    main()

    captured = capsys.readouterr()
    assert "SayClearly is initialized." in captured.out
